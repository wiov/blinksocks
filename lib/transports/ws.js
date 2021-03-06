'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WsOutbound = exports.WsInbound = undefined;

var _ws = require('ws');

var _ws2 = _interopRequireDefault(_ws);

var _tcp = require('./tcp');

var _utils = require('../utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function patchWebsocket(ws) {
  ws.write = buffer => ws.send(buffer, {
    compress: false,
    mask: false,
    fin: true }, () => this.emit('drain'));
  ws.end = () => ws.close();
  ws.destroy = () => ws.close();
  ws.setTimeout = () => {};
  ws.on('open', (...args) => ws.emit('connect', ...args));
  return ws;
}

class WsInbound extends _tcp.TcpInbound {

  constructor(props) {
    super(props);
    if (this._socket) {
      const socket = this._socket;
      socket.on('message', this.onReceive);
      socket.on('close', () => socket.destroyed = true);
      patchWebsocket.call(this, socket);
    }
  }

  get name() {
    return 'ws:inbound';
  }

  get bufferSize() {
    return this._socket ? this._socket.bufferedAmount : 0;
  }

  get writable() {
    return this._socket && this._socket.readyState === _ws2.default.OPEN;
  }

}

exports.WsInbound = WsInbound;
class WsOutbound extends _tcp.TcpOutbound {

  get name() {
    return 'ws:outbound';
  }

  get bufferSize() {
    return this._socket ? this._socket.bufferedAmount : 0;
  }

  get writable() {
    return this._socket && this._socket.readyState === _ws2.default.OPEN;
  }

  _connect({ host, port }) {
    var _this = this;

    return _asyncToGenerator(function* () {
      _utils.logger.info(`[${_this.name}] [${_this.remote}] connecting to ws://${host}:${port}`);
      const socket = new _ws2.default(`ws://${host}:${port}`, { perMessageDeflate: false });
      socket.on('message', _this.onReceive);
      socket.on('close', function () {
        return socket.destroyed = true;
      });
      return patchWebsocket.call(_this, socket);
    })();
  }

}
exports.WsOutbound = WsOutbound;