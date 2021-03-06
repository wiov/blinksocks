'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TlsOutbound = exports.TlsInbound = undefined;

var _tls = require('tls');

var _tls2 = _interopRequireDefault(_tls);

var _tcp = require('./tcp');

var _utils = require('../utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

class TlsInbound extends _tcp.TcpInbound {

  get name() {
    return 'tls:inbound';
  }

  get bufferSize() {
    return super.bufferSize - 1;
  }

}

exports.TlsInbound = TlsInbound;
class TlsOutbound extends _tcp.TcpOutbound {

  get name() {
    return 'tls:outbound';
  }

  get bufferSize() {
    return super.bufferSize - 1;
  }

  _connect({ host, port }) {
    var _this = this;

    return _asyncToGenerator(function* () {
      _utils.logger.info(`[tls:outbound] [${_this.remote}] connecting to tls://${host}:${port}`);
      return _tls2.default.connect({ host, port, ca: [_this._config.tls_cert] });
    })();
  }

}
exports.TlsOutbound = TlsOutbound;