'use strict';Object.defineProperty(exports,'__esModule',{value:true});exports.UdpRelay=undefined;var _slicedToArray=function(){function sliceIterator(arr,i){var _arr=[];var _n=true;var _d=false;var _e=undefined;try{for(var _i=arr[Symbol.iterator](),_s;!(_n=(_s=_i.next()).done);_n=true){_arr.push(_s.value);if(i&&_arr.length===i)break}}catch(err){_d=true;_e=err}finally{try{if(!_n&&_i['return'])_i['return']()}finally{if(_d)throw _e}}return _arr}return function(arr,i){if(Array.isArray(arr)){return arr}else if(Symbol.iterator in Object(arr)){return sliceIterator(arr,i)}else{throw new TypeError('Invalid attempt to destructure non-iterable instance')}}}();var _createClass=function(){function defineProperties(target,props){for(var i=0;i<props.length;i++){var descriptor=props[i];descriptor.enumerable=descriptor.enumerable||false;descriptor.configurable=true;if('value'in descriptor)descriptor.writable=true;Object.defineProperty(target,descriptor.key,descriptor)}}return function(Constructor,protoProps,staticProps){if(protoProps)defineProperties(Constructor.prototype,protoProps);if(staticProps)defineProperties(Constructor,staticProps);return Constructor}}();var _path=require('path');var _path2=_interopRequireDefault(_path);var _dgram=require('dgram');var _dgram2=_interopRequireDefault(_dgram);var _log4js=require('log4js');var _log4js2=_interopRequireDefault(_log4js);var _Address=require('../Address');var _Config=require('../Config');var _Crypto=require('../Crypto');var _DNSCache=require('../DNSCache');var _Encapsulator=require('../Encapsulator');function _interopRequireDefault(obj){return obj&&obj.__esModule?obj:{default:obj}}function _asyncToGenerator(fn){return function(){var gen=fn.apply(this,arguments);return new Promise(function(resolve,reject){function step(key,arg){try{var info=gen[key](arg);var value=info.value}catch(error){reject(error);return}if(info.done){resolve(value)}else{return Promise.resolve(value).then(function(value){step('next',value)},function(err){step('throw',err)})}}return step('next')})}}function _classCallCheck(instance,Constructor){if(!(instance instanceof Constructor)){throw new TypeError('Cannot call a class as a function')}}var Logger=_log4js2.default.getLogger(_path2.default.basename(__filename,'.js'));var dnsCache=_DNSCache.DNSCache.create();/**
 * return 6 length hash string of a buffer, for debugging
 * @param buffer
 * @returns {string}
 */function hash(buffer){return _Crypto.Crypto.hash(buffer).slice(0,6)}var UdpRelay=exports.UdpRelay=function(){// backward net.Socket
function UdpRelay(options){var _this=this;_classCallCheck(this,UdpRelay);this._id=null;this._lsocket=null;this._socket=null;this._iv=null;this._cipher=null;this._decipher=null;Logger.setLevel(_Config.Config.log_level);this._id=options.id;this._lsocket=options.socket;this._socket=_dgram2.default.createSocket('udp4');this._socket.on('message',function(msg/* , rinfo */){return _this.onReceiving(msg)})}// forward net.Socket
_createClass(UdpRelay,[{key:'onReceiving',value:function onReceiving(msg){if(_Config.Config.isServer){this._cipher.write(msg)}else{this._decipher.write(msg)}}},{key:'onReceived',value:function onReceived(msg){if(_Config.Config.isServer){this.backwardToClient(msg)}else{this.backwardToApplication(msg)}}/**
   * backward data to out client
   * @param encrypted
   */},{key:'backwardToClient',value:function backwardToClient(encrypted){if(Logger.isInfoEnabled()){var logs=['['+this._id+']',encrypted.length+' bytes(encrypted,'+hash(encrypted)+')'];Logger.info(logs.join(' <-udp- '))}this._lsocket.write(encrypted)}/**
   * backward data to applications
   * @param data
   */},{key:'backwardToApplication',value:function backwardToApplication(data){if(Logger.isInfoEnabled()){var logs=['['+this._id+']',data.length+' bytes(decrypted,'+hash(data)+')'];Logger.info(logs.join(' <-udp- '))}this._lsocket.write(data)}/**
   * forward data to our server
   * @param encrypted
   */},{key:'forwardToServer',value:function(){var _ref=_asyncToGenerator(regeneratorRuntime.mark(function _callee(encrypted){var _ref2,host,port,ip,logs;return regeneratorRuntime.wrap(function _callee$(_context){while(1){switch(_context.prev=_context.next){case 0:_ref2=[_Config.Config.server_host,_Config.Config.server_port],host=_ref2[0],port=_ref2[1];_context.next=3;return dnsCache.get(host);case 3:ip=_context.sent;this._socket.send(encrypted,port,ip);if(Logger.isInfoEnabled()){logs=['['+this._id+']',encrypted.length+' bytes (+header,encrypted,'+hash(encrypted)+')'];Logger.info(logs.join(' -udp-> '))}case 6:case'end':return _context.stop();}}},_callee,this)}));function forwardToServer(_x){return _ref.apply(this,arguments)}return forwardToServer}()/**
   * forward data to real server
   * @param decrypted
   */},{key:'forwardToDst',value:function(){var _ref3=_asyncToGenerator(regeneratorRuntime.mark(function _callee2(decrypted){var frame,data,addr,_addr$getEndPoint,_addr$getEndPoint2,host,port,ip,logs;return regeneratorRuntime.wrap(function _callee2$(_context2){while(1){switch(_context2.prev=_context2.next){case 0:frame=_Encapsulator.Encapsulator.unpack(decrypted);if(!(frame===null)){_context2.next=4;break}if(Logger.isWarnEnabled()){Logger.warn('['+this._id+'] -x-> dropped unidentified packet '+decrypted.length+' bytes')}return _context2.abrupt('return');case 4:data=frame.DATA;addr=new _Address.Address({ATYP:frame.ATYP,DSTADDR:frame.DSTADDR,DSTPORT:frame.DSTPORT});_addr$getEndPoint=addr.getEndPoint(),_addr$getEndPoint2=_slicedToArray(_addr$getEndPoint,2),host=_addr$getEndPoint2[0],port=_addr$getEndPoint2[1];_context2.next=9;return dnsCache.get(host);case 9:ip=_context2.sent;this._socket.send(data,port,ip);if(Logger.isInfoEnabled()){logs=['['+this._id+']',decrypted.length+' bytes(decrypted,'+hash(decrypted)+')',data.length+' bytes(-header,'+hash(data)+')'];Logger.info(logs.join(' -udp-> '))}case 12:case'end':return _context2.stop();}}},_callee2,this)}));function forwardToDst(_x2){return _ref3.apply(this,arguments)}return forwardToDst}()/**
   * update _cipher and _decipher, with iv if necessary
   */},{key:'updateCiphers',value:function updateCiphers(){var _this2=this;var collector=function collector(buffer){return _this2.onReceived(buffer)};var iv=this._iv===null?undefined:this._iv;this._cipher=_Crypto.Crypto.createCipher(collector,iv);this._decipher=_Crypto.Crypto.createDecipher(collector,iv)}/**
   * set initialization vector
   * @param iv
   */},{key:'setIV',value:function setIV(iv){this._iv=iv}}]);return UdpRelay}();