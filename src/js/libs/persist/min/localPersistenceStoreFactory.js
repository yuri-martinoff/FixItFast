/**
 * @license
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */
define(["./impl/localPersistenceStore"],function(a){"use strict";return function(){function b(b,c){return new Promise(function(d,e){var f=new a(b);f.Init(c).then(function(){d(f)},function(a){e(a)})})}return{createPersistenceStore:function(a,c){return b(a,c)}}}()});
//# sourceMappingURL=localPersistenceStoreFactory.js.map