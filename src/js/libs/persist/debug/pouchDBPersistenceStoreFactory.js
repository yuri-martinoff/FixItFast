/**
 * @license
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */
/**
 * Copyright (c) 2018, Oracle and/or its affiliates.
 * All rights reserved.
 */

define(["./impl/pouchDBPersistenceStore"],
       function(PouchDBPersistenceStore) {
  'use strict';

  var PouchDBPersistenceStoreFactory = (function () {

    function _createPersistenceStore (name, options) {
      return new Promise(function (resolve, reject) {
        var store = new PouchDBPersistenceStore(name);
        store.Init(options).then(function () {
          resolve(store);
        }, function (err) {
          reject(err);
        });
      });
    };

    return {
      'createPersistenceStore' : function (name, options) {
        return _createPersistenceStore(name, options);
      }
    };
  }());

  return PouchDBPersistenceStoreFactory;
});