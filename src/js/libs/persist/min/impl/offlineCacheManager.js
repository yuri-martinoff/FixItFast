/**
 * @license
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */
define(["../persistenceStoreManager","./OfflineCache"],function(a,b){"use strict";function c(){this._prefix="offlineCaches-",this._caches={},this._cachesArray=[]}return c.prototype.open=function(c){var d=this,e=d._caches[c];return e?Promise.resolve(e):new Promise(function(f,g){a.openStore(d._prefix+c).then(function(a){e=new b(c,a),d._caches[c]=e,d._cachesArray.push(e),f(e)}).catch(function(a){g(a)})})},c.prototype.match=function(a,b){var c=this;return new Promise(function(d,e){var f=function(c,g){if(g===c.length)d();else{c[g].match(a,b).then(function(a){a?d(a.clone()):f(c,g+1)},function(a){e(a)})}};f(c._cachesArray,0)})},c.prototype.has=function(a){return this._caches[a]?Promise.resolve(!0):Promise.resolve(!1)},c.prototype.delete=function(a){var b=this;return new Promise(function(c,d){var e=b._caches[a];e?e.delete().then(function(){b._cachesArray.splice(b._cachesArray.indexOf(a),1),delete b._caches[a],c(!0)},function(a){d(a)}):c(!1)})},c.prototype.keys=function(){for(var a=[],b=0;b<this._cachesArray.length;b++)a.push(this._cachesArray[b].getName());return Promise.resolve(a)},new c});
//# sourceMappingURL=offlineCacheManager.js.map