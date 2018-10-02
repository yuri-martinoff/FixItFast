/**
 * @license
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */
define(["./persistenceUtils"],function(a){"use strict";function b(a){if(!a||1!==a.length)throw new Error({message:"shredded data is not in the correct format."});var b=a[0].data;return b&&1===b.length&&"single"===a[0].resourceType?b[0]:b}return{getShredder:function(a,b){return function(c){return new Promise(function(d,e){var f=c.clone(),g=f.headers.get("Etag");f.text().then(function(c){var e=[],f=[],h="collection";if(c&&c.length>0)try{var i=JSON.parse(c);Array.isArray(i)?(e=i.map(function(a){return a[b]}),f=i):(e[0]=i[b],f[0]=i,h="single")}catch(a){}d([{name:a,resourceIdentifier:g,keys:e,data:f,resourceType:h}])}).catch(function(a){e(a)})})}},getUnshredder:function(){return function(c,d){return Promise.resolve().then(function(){var e=b(c);return a.setResponsePayload(d,e)}).then(function(a){return a.headers.set("x-oracle-jscpt-cache-expiration-date",""),Promise.resolve(a)})}}}});
//# sourceMappingURL=simpleJsonShredding.js.map