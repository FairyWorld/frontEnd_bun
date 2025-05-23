'use strict';

const common = require('../common');
if (!common.hasCrypto)
  common.skip('missing crypto');

const assert = require('assert');
const {
  generateKeyPair,
} = require('crypto');
const {
  testSignVerify,
  spkiExp,
  sec1Exp,
} = require('../common/crypto');

// Test async explicit elliptic curve key generation, e.g. for ECDSA,
// with a SEC1 private key with paramEncoding explicit.
{
  generateKeyPair('ec', {
    namedCurve: 'prime256v1',
    paramEncoding: 'explicit',
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'sec1',
      format: 'pem'
    }
  }, common.mustCall((err, publicKey, privateKey) => {
    if (common.openSSLIsBoringSSL) {
      // BoringSSL does not support 'explicit' param encoding.
      assert.strictEqual(err.message, 'error:06000085:public key routines:OPENSSL_internal:INVALID_PARAMETERS')
      return;
    }
    assert.strictEqual(typeof publicKey, 'string');
    assert.match(publicKey, spkiExp);
    assert.strictEqual(typeof privateKey, 'string');
    assert.match(privateKey, sec1Exp);

    testSignVerify(publicKey, privateKey);
  }));
}
