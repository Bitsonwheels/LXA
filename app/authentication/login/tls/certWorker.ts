import forge from 'node-forge';

// Worker listens for a message to start certificate generation.
// It posts back an object { id, pemCert, pemKey } on success or { id, error } on failure.
self.addEventListener('message', (ev: MessageEvent) => {
  const payload = ev.data && typeof ev.data === 'object' ? ev.data : {};
  const id = typeof payload.id !== 'undefined' ? payload.id : null;
  const password = typeof payload.password === 'string' ? payload.password : '';
  try {
    const pki = forge.pki;
    // Generate a 2048-bit RSA keypair. This is CPU intensive which is why we run it in a worker.
    const keys = pki.rsa.generateKeyPair({ bits: 2048 });

    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = String(Date.now());
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(
      cert.validity.notBefore.getFullYear() + 2,
    );

    const attrs = [
      {
        name: 'organizationName',
        value: `LXA ${typeof location !== 'undefined' ? location.hostname : ''}`,
      },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey);

    const pemCert = pki.certificateToPem(cert);
    const pemKey = pki.privateKeyToPem(keys.privateKey);

    // Create PFX (PKCS#12) with the supplied password (may be empty string)
    let pfxBase64: string | undefined;
    try {
      const pfxAsn1 = forge.pkcs12.toPkcs12Asn1(
        keys.privateKey,
        [cert],
        password,
        {
          algorithm: '3des',
        },
      );
      const pfxDer = forge.asn1.toDer(pfxAsn1).getBytes();
      pfxBase64 = forge.util.encode64(pfxDer);
    } catch (pfxErr) {
      // If pfx creation fails, we still return cert/key but include an error for pfx
      (self as unknown as Worker).postMessage({
        id,
        pemCert,
        pemKey,
        pfxError: (pfxErr instanceof Error && pfxErr.message) || String(pfxErr),
      });
      return;
    }

    (self as unknown as Worker).postMessage({ id, pemCert, pemKey, pfxBase64 });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      error: (err instanceof Error && err.message) || String(err),
    });
  }
});

export {};
