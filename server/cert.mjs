import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  X509Certificate,
  X509CertificateGenerator,
  BasicConstraintsExtension,
  KeyUsagesExtension,
  KeyUsageFlags,
  ExtendedKeyUsageExtension,
  SubjectAlternativeNameExtension,
} from '@peculiar/x509'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CERT_DIR = path.join(ROOT, 'certs')
fs.mkdirSync(CERT_DIR, { recursive: true })

const webcrypto = crypto.webcrypto
const ALG = { name: 'ECDSA', namedCurve: 'P-256' }
const YEAR = 365 * 24 * 60 * 60 * 1000
const notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000)
const notAfter = new Date(Date.now() + 10 * YEAR)

const CA_CERT = path.join(CERT_DIR, 'meridian-ca.crt')
const CA_KEY = path.join(CERT_DIR, 'meridian-ca-key.pem')
const LEAF_CERT = path.join(CERT_DIR, 'meridian-cert.pem')
const LEAF_KEY = path.join(CERT_DIR, 'meridian-key.pem')
const SAN_FILE = path.join(CERT_DIR, 'sans.json')

function toPem(der, label) {
  const b64 = Buffer.from(der).toString('base64').match(/.{1,64}/g)?.join('\n') ?? ''
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`
}

function fromPem(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  return Buffer.from(b64, 'base64')
}

function lanIPs() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address)
}

const args = process.argv.slice(2)
const reissue = args.includes('--ip')
const extraIpIndex = args.indexOf('--ip')
const extraIp = extraIpIndex >= 0 ? args[extraIpIndex + 1] : null

let caKeys
let caCert

if (reissue && fs.existsSync(CA_CERT) && fs.existsSync(CA_KEY)) {
  caCert = new X509Certificate(fs.readFileSync(CA_CERT, 'utf8'))
  caKeys = {
    privateKey: await webcrypto.subtle.importKey(
      'pkcs8', fromPem(fs.readFileSync(CA_KEY, 'utf8')), ALG, true, ['sign'],
    ),
    publicKey: await webcrypto.subtle.importKey(
      'spki', fromPem(caCert.publicKey.toString('pem')), ALG, true, ['verify'],
    ),
  }
  console.log('Reusing existing Meridian CA — your phone keeps trusting it.')
} else {
  caKeys = await webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify'])
  caCert = await X509CertificateGenerator.createSelfSigned({
    name: 'CN=Meridian Local CA',
    keys: caKeys,
    notBefore,
    notAfter,
    extensions: [
      new BasicConstraintsExtension(true, 0, true),
      new KeyUsagesExtension(KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign, true),
    ],
  }, webcrypto)
  fs.writeFileSync(CA_CERT, caCert.toString('pem'), { mode: 0o644 })
  fs.writeFileSync(
    CA_KEY,
    toPem(await webcrypto.subtle.exportKey('pkcs8', caKeys.privateKey), 'PRIVATE KEY'),
    { mode: 0o600 },
  )
}

const ips = [...new Set([...lanIPs(), ...(extraIp ? [extraIp] : [])])]
const sans = [
  { type: 'dns', value: 'meridian.local' },
  { type: 'dns', value: 'localhost' },
  { type: 'ip', value: '127.0.0.1' },
  ...ips.map((ip) => ({ type: 'ip', value: ip })),
]

const leafKeys = await webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify'])
const leafCert = await X509CertificateGenerator.create({
  subject: 'CN=meridian.local',
  issuer: caCert.subject,
  publicKey: leafKeys.publicKey,
  signingKey: caKeys.privateKey,
  notBefore,
  notAfter: new Date(Date.now() + 2 * YEAR),
  extensions: [
    new BasicConstraintsExtension(false),
    new KeyUsagesExtension(KeyUsageFlags.digitalSignature | KeyUsageFlags.keyEncipherment, true),
    new ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1']),
    new SubjectAlternativeNameExtension(sans),
  ],
}, webcrypto)

fs.writeFileSync(LEAF_CERT, leafCert.toString('pem'), { mode: 0o644 })
fs.writeFileSync(
  LEAF_KEY,
  toPem(await webcrypto.subtle.exportKey('pkcs8', leafKeys.privateKey), 'PRIVATE KEY'),
  { mode: 0o600 },
)
fs.writeFileSync(SAN_FILE, JSON.stringify({ sans, generatedAt: Date.now() }, null, 2))

console.log('')
console.log('  MERIDIAN LOCAL CERTIFICATE')
console.log('  ────────────────────────────────────────────')
console.log(`  Server:  https://${ips[0] ?? '192.168.1.x'}:8787`)
console.log(`  Names:   meridian.local, localhost, ${ips.join(', ') || 'no LAN IP'}`)
console.log(`  CA:      ${CA_CERT}`)
console.log('')
console.log('  On your phone, install that CA once:')
console.log('    Settings → Security → Install from storage → CA certificate')
console.log('  Then open the HTTPS address and add Meridian to your home screen.')
console.log('')
console.log('  If your IP changes later: npm run cert:ip -- <new-ip>')
console.log('')
