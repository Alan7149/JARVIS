"""Generate a self-signed SSL certificate for JARVIS HTTPS."""
import datetime
import ipaddress
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

CERT_DIR = Path(__file__).parent / "certs"
CERT_DIR.mkdir(exist_ok=True)
CERT_PATH = CERT_DIR / "jarvis.crt"
KEY_PATH  = CERT_DIR / "jarvis.key"

# IPs this cert is valid for
IPS = [
    "100.88.129.47",   # Tailscale
    "192.168.1.140",   # Local WiFi
    "127.0.0.1",
]


def generate():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "JARVIS AI"),
        x509.NameAttribute(NameOID.COMMON_NAME, "JARVIS"),
    ])

    san_ips = [x509.IPAddress(ipaddress.IPv4Address(ip)) for ip in IPS]
    san_dns = [
        x509.DNSName("jarvis.local"),
        x509.DNSName("localhost"),
    ]

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(san_ips + san_dns), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    KEY_PATH.write_bytes(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ))
    CERT_PATH.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    print(f"Certificate: {CERT_PATH}")
    print(f"Private key: {KEY_PATH}")
    print("Valid for IPs:", IPS)
    print("Valid for 10 years.")
    return str(CERT_PATH), str(KEY_PATH)


if __name__ == "__main__":
    generate()
