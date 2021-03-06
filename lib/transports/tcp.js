'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TcpOutbound = exports.TcpInbound = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _defs = require('./defs');

var _constants = require('../constants');

var _utils = require('../utils');

var _acl = require('../core/acl');

var _actions = require('../presets/actions');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

class TcpInbound extends _defs.Inbound {

  constructor(props) {
    super(props);
    this._socket = null;
    this._destroyed = false;
    this.onError = this.onError.bind(this);
    this.onReceive = this.onReceive.bind(this);
    this.onDrain = this.onDrain.bind(this);
    this.onTimeout = this.onTimeout.bind(this);
    this.onHalfClose = this.onHalfClose.bind(this);
    this.onClose = this.onClose.bind(this);
    if (this.ctx.socket) {
      this._socket = this.ctx.socket;
      this._socket.on('error', this.onError);
      this._socket.on('data', this.onReceive);
      this._socket.on('drain', this.onDrain);
      this._socket.on('timeout', this.onTimeout);
      this._socket.on('end', this.onHalfClose);
      this._socket.on('close', this.onClose);
      this._socket.setTimeout && this._socket.setTimeout(this._config.timeout);
    }
  }

  get name() {
    return 'tcp:inbound';
  }

  get bufferSize() {
    return this._socket ? this._socket.bufferSize : 0;
  }

  get writable() {
    return this._socket && !this._socket.destroyed && this._socket.writable;
  }

  write(buffer) {
    if (this.writable) {
      this._socket.write(buffer);
    }
  }

  onError(err) {
    _utils.logger.warn(`[${this.name}] [${this.remote}] ${err.message}`);
  }

  onReceive(buffer) {
    const direction = this._config.is_client ? _constants.PIPE_ENCODE : _constants.PIPE_DECODE;
    this.ctx.pipe.feed(direction, buffer);

    const outbound = this.getOutbound();
    if (outbound && outbound.bufferSize >= _constants.MAX_BUFFERED_SIZE) {
      _utils.logger.debug(`[${this.name}] [${this.remote}] recv paused due to outbound.bufferSize=${outbound.bufferSize} >= ${_constants.MAX_BUFFERED_SIZE}`);
      this._socket.pause();
      outbound.once('drain', () => {
        if (this._socket && !this._socket.destroyed) {
          _utils.logger.debug(`[${this.name}] [${this.remote}] resume to recv`);
          this._socket.resume();
        }
      });
    }
  }

  onDrain() {
    this.emit('drain');
  }

  onTimeout() {
    _utils.logger.warn(`[${this.name}] [${this.remote}] timeout: no I/O on the connection for ${this._config.timeout / 1e3}s`);
    this.onClose();
  }

  onHalfClose() {
    this._outbound && this._outbound.end();
  }

  onClose() {
    this.close();
    if (this._outbound) {
      this._outbound.close();
      this._outbound = null;
    }
  }

  end() {
    this._socket && this._socket.end();
  }

  close() {
    const doClose = () => {
      if (this._socket) {
        this._socket.destroy();
        this._socket = null;
      }
      if (!this._destroyed) {
        this._destroyed = true;
        this.emit('close');
      }
    };
    if (this.bufferSize > 0) {
      this.once('drain', doClose);
    } else {
      doClose();
    }
  }

  onBroadcast(action) {
    switch (action.type) {
      case _actions.CONNECT_TO_REMOTE:
        this._socket && this._socket.pause();
        break;
      case _actions.CONNECTED_TO_REMOTE:
        this._socket && this._socket.resume();
        break;
      case _actions.PRESET_FAILED:
        this.onPresetFailed(action);
        break;
      case _acl.ACL_CLOSE_CONNECTION:
        _utils.logger.info(`[${this.name}] [${this.remote}] acl request to close connection`);
        this.close();
        break;
      case _acl.ACL_PAUSE_RECV:
        this._socket && this._socket.pause();
        break;
      case _acl.ACL_RESUME_RECV:
        this._socket && this._socket.resume();
        break;
      default:
        break;
    }
  }

  onPresetFailed(action) {
    var _this = this;

    return _asyncToGenerator(function* () {
      var _action$payload = action.payload;
      const name = _action$payload.name,
            message = _action$payload.message;

      _utils.logger.error(`[${_this.name}] [${_this.remote}] preset "${name}" fail to process: ${message}`);

      if (_this._config.is_client) {
        _utils.logger.warn(`[${_this.name}] [${_this.remote}] connection closed`);
        _this.onClose();
      }

      if (_this._config.is_server && !_this._config.mux) {
        if (_this._config.redirect) {
          const orgData = action.payload.orgData;

          var _config$redirect$spli = _this._config.redirect.split(':'),
              _config$redirect$spli2 = _slicedToArray(_config$redirect$spli, 2);

          const host = _config$redirect$spli2[0],
                port = _config$redirect$spli2[1];


          _utils.logger.warn(`[${_this.name}] [${_this.remote}] connection is redirecting to: ${host}:${port}`);

          _this.updatePresets([{ name: 'tracker' }]);

          yield _this._outbound.connect({ host, port: +port });
          if (_this._outbound.writable) {
            _this._outbound.write(orgData);
          }
        } else {
          _this._socket && _this._socket.pause();
          const timeout = (0, _utils.getRandomInt)(10, 40);
          _utils.logger.warn(`[${_this.name}] [${_this.remote}] connection will be closed in ${timeout}s...`);
          setTimeout(_this.onClose, timeout * 1e3);
        }
      }
    })();
  }

}

exports.TcpInbound = TcpInbound;
class TcpOutbound extends _defs.Outbound {

  constructor(props) {
    super(props);
    this._socket = null;
    this._destroyed = false;
    this.onError = this.onError.bind(this);
    this.onReceive = this.onReceive.bind(this);
    this.onDrain = this.onDrain.bind(this);
    this.onTimeout = this.onTimeout.bind(this);
    this.onHalfClose = this.onHalfClose.bind(this);
    this.onClose = this.onClose.bind(this);
  }

  get name() {
    return 'tcp:outbound';
  }

  get bufferSize() {
    return this._socket ? this._socket.bufferSize : 0;
  }

  get writable() {
    return this._socket && !this._socket.destroyed && this._socket.writable;
  }

  write(buffer) {
    if (this.writable) {
      this._socket.write(buffer);
    }
  }

  onError(err) {
    _utils.logger.warn(`[${this.name}] [${this.remote}] ${err.message}`);
  }

  onReceive(buffer) {
    const direction = this._config.is_client ? _constants.PIPE_DECODE : _constants.PIPE_ENCODE;
    this.ctx.pipe.feed(direction, buffer);

    const inbound = this.getInbound();
    if (inbound && inbound.bufferSize >= _constants.MAX_BUFFERED_SIZE) {
      _utils.logger.debug(`[${this.name}] [${this.remote}] recv paused due to inbound.bufferSize=${inbound.bufferSize} >= ${_constants.MAX_BUFFERED_SIZE}`);
      this._socket.pause();
      inbound.once('drain', () => {
        if (this._socket && !this._socket.destroyed) {
          _utils.logger.debug(`[${this.name}] [${this.remote}]  resume to recv`);
          this._socket.resume();
        }
      });
    }
  }

  onDrain() {
    this.emit('drain');
  }

  onTimeout() {
    _utils.logger.warn(`[${this.name}] [${this.remote}] timeout: no I/O on the connection for ${this._config.timeout / 1e3}s`);
    this.onClose();
  }

  onHalfClose() {
    this._inbound && this._inbound.end();
  }

  onClose() {
    this.close();
    if (this._inbound) {
      this._inbound.close();
      this._inbound = null;
    }
  }

  end() {
    this._socket && this._socket.end();
  }

  close() {
    const doClose = () => {
      if (this._socket) {
        this._socket.destroy();
        this._socket = null;
      }
      if (!this._destroyed) {
        this._destroyed = true;
        this.emit('close');
      }
    };
    if (this.bufferSize > 0) {
      this.once('drain', doClose);
    } else {
      doClose();
    }
  }

  onBroadcast(action) {
    switch (action.type) {
      case _actions.CONNECT_TO_REMOTE:
        this.onConnectToRemote(action);
        break;
      case _acl.ACL_PAUSE_SEND:
        this._socket && this._socket.pause();
        break;
      case _acl.ACL_RESUME_SEND:
        this._socket && this._socket.resume();
        break;
      default:
        break;
    }
  }

  onConnectToRemote(action) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      var _action$payload2 = action.payload;
      const host = _action$payload2.host,
            port = _action$payload2.port,
            keepAlive = _action$payload2.keepAlive,
            onConnected = _action$payload2.onConnected;

      if (!keepAlive || !_this2._socket) {
        try {
          if (_this2._config.is_server) {
            yield _this2.connect({ host, port });
          }
          if (_this2._config.is_client) {
            yield _this2.connect({ host: _this2._config.server_host, port: _this2._config.server_port });
          }
          _this2._socket.on('connect', function () {
            if (typeof onConnected === 'function') {
              onConnected(function (buffer) {
                if (buffer) {
                  const type = _this2._config.is_client ? _constants.PIPE_ENCODE : _constants.PIPE_DECODE;
                  _this2.ctx.pipe.feed(type, buffer, { cid: _this2.ctx.proxyRequest.cid, host, port });
                }
              });
            }
            _this2.ctx.pipe.broadcast(null, { type: _actions.CONNECTED_TO_REMOTE, payload: { host, port } });
          });
        } catch (err) {
          _utils.logger.warn(`[${_this2.name}] [${_this2.remote}] cannot connect to ${host}:${port},`, err);
          _this2.onClose();
        }
      } else {
        _this2.ctx.pipe.broadcast(null, { type: _actions.CONNECTED_TO_REMOTE, payload: { host, port } });
      }
    })();
  }

  connect({ host, port }) {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      if (_this3._socket && !_this3._socket.destroyed) {
        _this3._socket.destroy();
      }
      _this3._socket = yield _this3._connect({ host, port });
      _this3._socket.on('error', _this3.onError);
      _this3._socket.on('end', _this3.onHalfClose);
      _this3._socket.on('close', _this3.onClose);
      _this3._socket.on('timeout', _this3.onTimeout);
      _this3._socket.on('data', _this3.onReceive);
      _this3._socket.on('drain', _this3.onDrain);
      _this3._socket.setTimeout(_this3._config.timeout);
    })();
  }

  _connect({ host, port }) {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      const ip = yield _utils.DNSCache.get(host);
      _utils.logger.info(`[${_this4.name}] [${_this4.remote}] connecting to tcp://${host}:${port} resolved=${ip}`);
      return _net2.default.connect({ host: ip, port });
    })();
  }

}
exports.TcpOutbound = TcpOutbound;