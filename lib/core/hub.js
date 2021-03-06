'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Hub = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _libsodiumWrappers = require('libsodium-wrappers');

var _libsodiumWrappers2 = _interopRequireDefault(_libsodiumWrappers);

var _dgram = require('dgram');

var _dgram2 = _interopRequireDefault(_dgram);

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _tls = require('tls');

var _tls2 = _interopRequireDefault(_tls);

var _ws = require('ws');

var _ws2 = _interopRequireDefault(_ws);

var _lruCache = require('lru-cache');

var _lruCache2 = _interopRequireDefault(_lruCache);

var _lodash = require('lodash.uniqueid');

var _lodash2 = _interopRequireDefault(_lodash);

var _config = require('./config');

var _relay = require('./relay');

var _muxRelay = require('./mux-relay');

var _utils = require('../utils');

var _proxies = require('../proxies');

var _constants = require('../constants');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

class Hub {

  constructor(config) {
    this._config = null;
    this._tcpServer = null;
    this._udpServer = null;
    this._tcpRelays = new Map();
    this._muxRelays = new Map();
    this._udpRelays = null;

    this._onConnection = (socket, proxyRequest = null) => {
      _utils.logger.verbose(`[hub] [${socket.remoteAddress}:${socket.remotePort}] connected`);

      const context = {
        socket,
        proxyRequest,
        remoteInfo: {
          host: socket.remoteAddress,
          port: socket.remotePort
        }
      };

      let muxRelay = null,
          cid = null;
      if (this._config.mux) {
        if (this._config.is_client) {
          cid = (0, _utils.hash)('sha256', (0, _lodash2.default)(_constants.APP_ID)).slice(-4).toString('hex');
          muxRelay = this._getMuxRelayOnClient(context, cid);
          context.muxRelay = muxRelay;
        } else {
          context.muxRelays = this._muxRelays;
        }
      }

      const relay = this._createRelay(context);

      if (this._config.mux) {
        if (this._config.is_client) {
          relay.id = cid;
          muxRelay.addSubRelay(relay);
        } else {
          this._muxRelays.set(relay.id, relay);
        }
      }

      relay.init({ proxyRequest });
      relay.on('close', () => this._tcpRelays.delete(relay.id));

      this._tcpRelays.set(relay.id, relay);
    };

    this._config = new _config.Config(config);
    this._udpRelays = (0, _lruCache2.default)({ max: 500, maxAge: 1e5, dispose: (_, relay) => relay.destroy() });
  }

  run() {
    var _this = this;

    return _asyncToGenerator(function* () {
      yield _libsodiumWrappers2.default.ready;
      if (!global.libsodium) {
        global.libsodium = _libsodiumWrappers2.default;
      }

      if (_this._tcpServer !== null) {
        yield _this.terminate();
      }

      yield _this._createServer();
    })();
  }

  terminate() {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      _this2._udpRelays.reset();

      if (_this2._config.mux) {
        _this2._muxRelays.forEach(function (relay) {
          return relay.destroy();
        });
        _this2._muxRelays.clear();
      }

      _this2._tcpRelays.forEach(function (relay) {
        return relay.destroy();
      });
      _this2._tcpRelays.clear();

      _this2._udpServer.close();

      _this2._tcpServer.close();
      _utils.logger.info('[hub] shutdown');
    })();
  }

  _createServer() {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      if (_this3._config.is_client) {
        _this3._tcpServer = yield _this3._createServerOnClient();
      } else {
        _this3._tcpServer = yield _this3._createServerOnServer();
      }
      _this3._udpServer = yield _this3._createUdpServer();
    })();
  }

  _createServerOnClient() {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      return new Promise(function (resolve, reject) {
        let server = null;
        switch (_this4._config.local_protocol) {
          case 'tcp':
            server = _proxies.tcp.createServer({ forwardHost: _this4._config.forward_host, forwardPort: _this4._config.forward_port });
            break;
          case 'socks':
          case 'socks5':
          case 'socks4':
          case 'socks4a':
            server = _proxies.socks.createServer({ bindAddress: _this4._config.local_host, bindPort: _this4._config.local_port });
            break;
          case 'http':
          case 'https':
            server = _proxies.http.createServer();
            break;
          default:
            return reject(Error(`unsupported protocol: "${_this4._config.local_protocol}"`));
        }
        const address = {
          host: _this4._config.local_host,
          port: _this4._config.local_port
        };
        server.on('proxyConnection', _this4._onConnection);
        server.on('error', reject);
        server.listen(address, function () {
          const service = `${_this4._config.local_protocol}://${_this4._config.local_host}:${_this4._config.local_port}`;
          _utils.logger.info(`[hub] blinksocks client is running at ${service}`);
          resolve(server);
        });
      });
    })();
  }

  _createServerOnServer() {
    var _this5 = this;

    return _asyncToGenerator(function* () {
      return new Promise(function (resolve, reject) {
        const address = {
          host: _this5._config.local_host,
          port: _this5._config.local_port
        };
        const onListening = function onListening(server) {
          const service = `${_this5._config.local_protocol}://${_this5._config.local_host}:${_this5._config.local_port}`;
          _utils.logger.info(`[hub] blinksocks server is running at ${service}`);
          resolve(server);
        };
        let server = null;
        switch (_this5._config.local_protocol) {
          case 'tcp':
            {
              server = _net2.default.createServer();
              server.on('connection', _this5._onConnection);
              server.listen(address, function () {
                return onListening(server);
              });
              break;
            }
          case 'ws':
            {
              server = new _ws2.default.Server(_extends({}, address, {
                perMessageDeflate: false
              }));
              server.on('connection', function (ws, req) {
                ws.remoteAddress = req.connection.remoteAddress;
                ws.remotePort = req.connection.remotePort;
                _this5._onConnection(ws);
              });
              server.on('listening', function () {
                return onListening(server);
              });
              break;
            }
          case 'tls':
            {
              server = _tls2.default.createServer({ key: [_this5._config.tls_key], cert: [_this5._config.tls_cert] });
              server.on('secureConnection', _this5._onConnection);
              server.listen(address, function () {
                return onListening(server);
              });
              break;
            }
          default:
            return reject(Error(`unsupported protocol: "${_this5._config.local_protocol}"`));
        }
        server.on('error', reject);
      });
    })();
  }

  _createUdpServer() {
    var _this6 = this;

    return _asyncToGenerator(function* () {
      return new Promise(function (resolve, reject) {
        const relays = _this6._udpRelays;
        const server = _dgram2.default.createSocket('udp4');

        server.on('message', function (msg, rinfo) {
          const address = rinfo.address,
                port = rinfo.port;

          let proxyRequest = null;
          let packet = msg;
          if (_this6._config.is_client) {
            const parsed = _proxies.socks.parseSocks5UdpRequest(msg);
            if (parsed === null) {
              _utils.logger.warn(`[hub] [${address}:${port}] drop invalid udp packet: ${(0, _utils.dumpHex)(msg)}`);
              return;
            }
            const host = parsed.host,
                  port = parsed.port,
                  data = parsed.data;

            proxyRequest = { host, port };
            packet = data;
          }
          const key = `${address}:${port}`;
          let relay = relays.get(key);
          if (relay === undefined) {
            const context = {
              socket: server,
              remoteInfo: { host: address, port: port }
            };
            relay = _this6._createUdpRelay(context);
            relay.init({ proxyRequest });
            relay.on('close', function onRelayClose() {});
            relays.set(key, relay);
            relays.prune();
          }
          if (relay._inbound) {
            relay._inbound.onReceive(packet, rinfo);
          }
        });

        server.on('error', reject);

        if (_this6._config.is_client) {
          server.send = function (send) {
            return function (data, port, host, isSs, ...args) {
              let packet = null;
              if (isSs) {
                packet = Buffer.from([0x00, 0x00, 0x00, ...data]);
              } else {
                packet = _proxies.socks.encodeSocks5UdpResponse({ host, port, data });
              }
              send.call(server, packet, port, host, ...args);
            };
          }(server.send);
        }

        server.bind({ address: _this6._config.local_host, port: _this6._config.local_port }, function () {
          const service = `udp://${_this6._config.local_host}:${_this6._config.local_port}`;
          _utils.logger.info(`[hub] blinksocks udp server is running at ${service}`);
          resolve(server);
        });
      });
    })();
  }

  _getMuxRelayOnClient(context, cid) {
    let muxRelay = this._selectMuxRelay();

    if (muxRelay === null) {
      muxRelay = this._createRelay(context, true);
      muxRelay.on('close', () => this._muxRelays.delete(muxRelay.id));
      this._muxRelays.set(muxRelay.id, muxRelay);
      _utils.logger.info(`[mux-${muxRelay.id}] create mux connection, total: ${this._muxRelays.size}`);
    }

    const proxyRequest = context.proxyRequest;

    if (muxRelay.isOutboundReady()) {
      proxyRequest.onConnected(buffer => {
        if (buffer) {
          muxRelay.encode(buffer, _extends({}, proxyRequest, { cid }));
        }
      });
    } else {
      proxyRequest.cid = cid;
      muxRelay.init({ proxyRequest });
    }
    return muxRelay;
  }

  _createRelay(context, isMux = false) {
    const props = {
      config: this._config,
      context: context,
      transport: this._config.transport,
      presets: this._config.presets
    };
    if (isMux) {
      return new _muxRelay.MuxRelay(props);
    }
    if (this._config.mux) {
      if (this._config.is_client) {
        return new _relay.Relay(_extends({}, props, { transport: 'mux', presets: [] }));
      } else {
        return new _muxRelay.MuxRelay(props);
      }
    } else {
      return new _relay.Relay(props);
    }
  }

  _createUdpRelay(context) {
    return new _relay.Relay({ config: this._config, transport: 'udp', context, presets: this._config.udp_presets });
  }

  _selectMuxRelay() {
    const relays = this._muxRelays;
    const concurrency = relays.size;
    if (concurrency < 1) {
      return null;
    }
    if (concurrency < this._config.mux_concurrency && (0, _utils.getRandomInt)(0, 1) === 0) {
      return null;
    }
    return relays.get([...relays.keys()][(0, _utils.getRandomInt)(0, concurrency - 1)]);
  }

}
exports.Hub = Hub;