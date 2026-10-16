$OPEN_SSL_PATH = "C:\Program Files\OpenSSL-Win64\bin\openssl.exe"

$IDS_KEY_FILE = "id_cert.key"
$IDS_CSR_FILE = "id_cert.csr"
$IDS_CERT_FILE = "id_cert.cert"
$IDS_PFX_FILE = "id_cert.pfx"

& $OPEN_SSL_PATH genpkey -out $IDS_KEY_FILE -algorithm RSA -pkeyopt rsa_keygen_bits:4096
& $OPEN_SSL_PATH req -new -key $IDS_KEY_FILE -out $IDS_CSR_FILE -subj /C=UK/ST=NA/O="Identity Server"/CN="localhost"
& $OPEN_SSL_PATH x509 -req -days 365 -in $IDS_CSR_FILE -signkey $IDS_KEY_FILE -out $IDS_CERT_FILE -extfile devcert_extra.cnf
& $OPEN_SSL_PATH pkcs12 -export -out $IDS_PFX_FILE -inkey $IDS_KEY_FILE -in $IDS_CERT_FILE -passout pass:devcert