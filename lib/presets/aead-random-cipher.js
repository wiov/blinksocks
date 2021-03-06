'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _defs = require('./defs');

var _utils = require('../utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const NONCE_LEN = 12;
const TAG_LEN = 16;
const MIN_CHUNK_LEN = TAG_LEN * 2 + 3;
const MIN_CHUNK_SPLIT_LEN = 0x0800;
const MAX_CHUNK_SPLIT_LEN = 0x3FFF;
const DEFAULT_INFO = 'bs-subkey';
const DEFAULT_FACTOR = 2;

const ciphers = {
  'aes-128-gcm': 16,
  'aes-192-gcm': 24,
  'aes-256-gcm': 32
};

const HKDF_HASH_ALGORITHM = 'sha1';

class AeadRandomCipherPreset extends _defs.IPreset {
  constructor(...args) {
    var _temp;

    return _temp = super(...args), this._cipherName = '', this._info = null, this._factor = DEFAULT_FACTOR, this._rawKey = null, this._keySaltSize = 0, this._cipherKey = null, this._decipherKey = null, this._cipherNonce = 0, this._decipherNonce = 0, this._nextExpectDecipherNonce = 0, this._adBuf = null, _temp;
  }

  static onCheckParams({ method, info = DEFAULT_INFO, factor = DEFAULT_FACTOR }) {
    if (method === undefined || method === '') {
      throw Error('\'method\' must be set');
    }
    const cipherNames = Object.keys(ciphers);
    if (!cipherNames.includes(method)) {
      throw Error(`'method' must be one of [${cipherNames}]`);
    }
    if (typeof info !== 'string' || info.length <= 0) {
      throw Error('\'info\' must be a non-empty string');
    }
    if (!Number.isInteger(factor)) {
      throw Error('\'factor\' must be an integer');
    }
    if (factor < 1 || factor > 10) {
      throw Error('\'factor\' must be in [1, 10]');
    }
  }

  onInit({ method, info = DEFAULT_INFO, factor = DEFAULT_FACTOR }) {
    this._cipherName = method;
    this._info = Buffer.from(info);
    this._factor = factor;
    this._rawKey = Buffer.from(this._config.key);
    this._keySaltSize = ciphers[method];
    this._adBuf = new _utils.AdvancedBuffer({ getPacketLength: this.onReceiving.bind(this) });
    this._adBuf.on('data', this.onChunkReceived.bind(this));
  }

  onDestroy() {
    this._adBuf.clear();
    this._adBuf = null;
    this._cipherKey = null;
    this._decipherKey = null;
    this._cipherNonce = 0;
    this._decipherNonce = 0;
    this._nextExpectDecipherNonce = 0;
  }

  beforeOut({ buffer }) {
    let salt = null;
    if (this._cipherKey === null) {
      const size = this._keySaltSize;
      salt = _crypto2.default.randomBytes(size);
      this._cipherKey = (0, _utils.HKDF)(HKDF_HASH_ALGORITHM, salt, this._rawKey, this._info, size);
    }
    const chunks = (0, _utils.getRandomChunks)(buffer, MIN_CHUNK_SPLIT_LEN, MAX_CHUNK_SPLIT_LEN).map(chunk => {
      const paddingLen = this.getPaddingLength(this._cipherKey, this._cipherNonce);
      const padding = _crypto2.default.randomBytes(paddingLen);

      const dataLen = (0, _utils.numberToBuffer)(chunk.length);

      var _encrypt = this.encrypt(dataLen),
          _encrypt2 = _slicedToArray(_encrypt, 2);

      const encLen = _encrypt2[0],
            lenTag = _encrypt2[1];

      var _encrypt3 = this.encrypt(chunk),
          _encrypt4 = _slicedToArray(_encrypt3, 2);

      const encData = _encrypt4[0],
            dataTag = _encrypt4[1];

      return Buffer.concat([padding, encLen, lenTag, encData, dataTag]);
    });
    if (salt) {
      return Buffer.concat([salt, ...chunks]);
    } else {
      return Buffer.concat(chunks);
    }
  }

  beforeIn({ buffer, next, fail }) {
    this._adBuf.put(buffer, { next, fail });
  }

  onReceiving(buffer, { fail }) {
    if (this._decipherKey === null) {
      const size = this._keySaltSize;
      if (buffer.length < size) {
        return;
      }
      const salt = buffer.slice(0, size);
      this._decipherKey = (0, _utils.HKDF)(HKDF_HASH_ALGORITHM, salt, this._rawKey, this._info, size);
      return buffer.slice(size);
    }

    if (this._decipherNonce === this._nextExpectDecipherNonce) {
      const paddingLen = this.getPaddingLength(this._decipherKey, this._decipherNonce);
      if (buffer.length < paddingLen) {
        return;
      }
      this._nextExpectDecipherNonce += 2;
      return buffer.slice(paddingLen);
    }

    if (buffer.length < MIN_CHUNK_LEN) {
      return;
    }

    var _ref = [buffer.slice(0, 2), buffer.slice(2, 2 + TAG_LEN)];
    const encLen = _ref[0],
          lenTag = _ref[1];

    const dataLenBuf = this.decrypt(encLen, lenTag);
    if (dataLenBuf === null) {
      fail(`unexpected DataLen_TAG=${lenTag.toString('hex')} when verify DataLen=${encLen.toString('hex')}, dump=${buffer.slice(0, 60).toString('hex')}`);
      return -1;
    }
    const dataLen = dataLenBuf.readUInt16BE(0);
    if (dataLen > MAX_CHUNK_SPLIT_LEN) {
      fail(`invalid DataLen=${dataLen} is over ${MAX_CHUNK_SPLIT_LEN}, dump=${buffer.slice(0, 60).toString('hex')}`);
      return -1;
    }
    return 2 + TAG_LEN + dataLen + TAG_LEN;
  }

  onChunkReceived(chunk, { next, fail }) {
    var _ref2 = [chunk.slice(2 + TAG_LEN, -TAG_LEN), chunk.slice(-TAG_LEN)];
    const encData = _ref2[0],
          dataTag = _ref2[1];

    const data = this.decrypt(encData, dataTag);
    if (data === null) {
      fail(`unexpected Data_TAG=${dataTag.toString('hex')} when verify Data=${encData.slice(0, 60).toString('hex')}, dump=${chunk.slice(0, 60).toString('hex')}`);
      return;
    }
    next(data);
  }

  getPaddingLength(key, nonce) {
    const nonceBuffer = (0, _utils.numberToBuffer)(nonce, NONCE_LEN, _utils.BYTE_ORDER_LE);
    const cipher = _crypto2.default.createCipheriv(this._cipherName, key, nonceBuffer);
    cipher.update(nonceBuffer);
    cipher.final();
    return cipher.getAuthTag()[0] * this._factor;
  }

  encrypt(message) {
    const cipher = _crypto2.default.createCipheriv(this._cipherName, this._cipherKey, (0, _utils.numberToBuffer)(this._cipherNonce, NONCE_LEN, _utils.BYTE_ORDER_LE));
    const encrypted = Buffer.concat([cipher.update(message), cipher.final()]);
    const tag = cipher.getAuthTag();
    this._cipherNonce += 1;
    return [encrypted, tag];
  }

  decrypt(ciphertext, tag) {
    const decipher = _crypto2.default.createDecipheriv(this._cipherName, this._decipherKey, (0, _utils.numberToBuffer)(this._decipherNonce, NONCE_LEN, _utils.BYTE_ORDER_LE));
    decipher.setAuthTag(tag);
    try {
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      this._decipherNonce += 1;
      return decrypted;
    } catch (err) {
      return null;
    }
  }

}
exports.default = AeadRandomCipherPreset;