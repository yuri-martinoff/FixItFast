/**
 * @license
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */
define(["./persistenceUtils"],function(a){"use strict";function b(a,b){if(!a||1!==a.length)throw new Error({message:"shredded data is not in the correct format."});var c=a[0].data;return c&&1===c.length&&"single"===a[0].resourceType?c[0]:{items:c,count:c.length}}return{getShredder:function(a,b){return function(c){return new Promise(function(d,e){var f=c.clone(),g=f.headers.get("X-ORACLE-DMS-ECID");f.text().then(function(c){var e=[],f=[],h="collection";if(null!=c&&c.length>0)try{var i=JSON.parse(c);null!=i.items?(e=i.items.map(function(a){return a[b]}),f=i.items):(e[0]=i[b],f[0]=i,h="single")}catch(a){}d([{name:a,resourceIdentifier:g,keys:e,data:f,resourceType:h}])}).catch(function(a){e(a)})})}},getUnshredder:function(){return function(c,d){return new Promise(function(e,f){var g=b(c,d);a.setResponsePayload(d,g).then(function(a){a.headers.set("x-oracle-jscpt-cache-expiration-date",""),e(a)})})}}}});
//# sourceMappingURL=oracleRestJsonShredding.js.map