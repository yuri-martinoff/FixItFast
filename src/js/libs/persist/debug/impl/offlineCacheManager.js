/**
 * @license
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */
/**
 * Copyright (c) 2018, Oracle and/or its affiliates.
 * All rights reserved.
 */

define(['../persistenceStoreManager', './OfflineCache'],
  function (persistenceStoreManager, OfflineCache) {
    'use strict';

    /**
     * OfflineCacheManager module.
     * Persistence Toolkit implementation of the standard
     * {@link https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage|
     *  CacheStorage API}.
     * This module is privately owned by {@link persistenceManager} for getting
     * hold of a cache instance. Multiple instances of {@link OfflinceCache}
     * is possible with different versions.
     * @module OfflineCacheManager
     */

    function OfflineCacheManager () {
      this._prefix = "offlineCaches-";
      // this is for fast lookup on cache name
      this._caches = {};
      // this is to persist the caches in insertion order.
      this._cachesArray = [];
    }

    /**
     * Creates or retrieves a cache with the specified name.
     * @method
     * @name open
     * @memberof! OfflineCacheManager
     * @instance
     * @param {string} cacheName Name of the cache.
     * @return {Promise} Returns a promise that resolves to the cache that is ready to
     *                           use for offline support.
     */
    OfflineCacheManager.prototype.open = function (cacheName) {
      var self = this;

      var cache = self._caches[cacheName];
      if (cache) {
        return Promise.resolve(cache);
      } else {
        return new Promise(function (resolve, reject) {
          persistenceStoreManager.openStore(self._prefix + cacheName)
          .then(function (store) {
             cache = new OfflineCache(cacheName, store);
             self._caches[cacheName] = cache;
             self._cachesArray.push(cache);
             resolve(cache);
           })
          .catch(function (err) {
             reject(err);
           });
        });
      }
    };

    /**
     * Find the response in all the caches managed by this OfflineCacheManager
     * that match the request with the options. Cache objects are searched by key
     * insertion order.
     * @method
     * @name match
     * @memberof! OfflineCacheManager
     * @instance
     * @param {Request} a request object to match against
     * @param {{ignoreSearch: boolean, ignoreMethod: boolean, ignoreVary: boolean}} options Options to control the matching operation
     * <ul>
     * <li>options.ignoreSearch A Boolean that specifies whether to ignore
     *                          the query string in the url.  For example,
     *                          if set to true the ?value=bar part of
     *                          http://foo.com/?value=bar would be ignored
     *                          when performing a match. It defaults to false.</li>
     * <li>options.ignoreMethod A Boolean that, when set to true, prevents
     *                          matching operations from validating the
     *                          Request http method (normally only GET and
     *                          HEAD are allowed.) It defaults to false.</li>
     * <li>options.ignoreVary A Boolean that when set to true tells the
     *                          matching operation not to perform VARY header
     *                          matching — i.e. if the URL matches you will get
     *                          a match regardless of whether the Response
     *                          object has a VARY header. It defaults to false.</li>
     * </ul>
     * @return {Promise} Return a Promise that resolves to the first matching response.
     */
    OfflineCacheManager.prototype.match = function (request, options) {
      var self = this;

      return new Promise(function (resolve, reject) {
        var getFirstMatch = function (cacheArray, currentIndex) {
          if (currentIndex === cacheArray.length) {
            // no match is found from all the caches, resolve to undefined.
            resolve();
          } else {
            var currentCache = cacheArray[currentIndex];
            currentCache.match(request, options).then(function (response) {
              if (response) {
                resolve(response.clone());
              } else {
                getFirstMatch(cacheArray, currentIndex + 1);
              }
            }, function (err) {
              reject(err);
            });
          }
        };
        getFirstMatch(self._cachesArray, 0);
      });
    };

    /**
     * Checks if cache with the specified name exists or not.
     * @method
     * @name has
     * @memberof! OfflineCacheManager
     * @instance
     * @param {string} cacheName Name of the cache to check for existence
     * @return {Promise} Returns a Promise that resolves to true if a Cache
     *                           object matches the cacheName.
     */
    OfflineCacheManager.prototype.has = function (cacheName) {
      if (this._caches[cacheName]) {
        return Promise.resolve(true);
      } else {
        return Promise.resolve(false);
      }
    };

    /**
     * Delete the cache with the specified name.
     * @method
     * @name delete
     * @memberof! OfflineCacheManager
     * @instance
     * @param {string} cacheName Name of the cache to delete
     * @return {Promise} Returns a Promise. If Cache object matching the cacheName is found
     *                   and deleted, the promise resolves to true, otherwise it resolves to
     *                   false.
     */
    OfflineCacheManager.prototype.delete = function (cacheName) {
      var self = this;
      return new Promise(function (resolve, reject) {
        var cache = self._caches[cacheName];
        if (cache) {
          cache.delete().then(function () {
            self._cachesArray.splice(self._cachesArray.indexOf(cacheName), 1);
            delete self._caches[cacheName];
            resolve(true);
          }, function (err) {
            reject(err);
          });
        } else {
          resolve(false);
        }
      });
    };

    /**
     * Returns an array of cache names managed by this OfflineCacheManager.
     * @method
     * @name keys
     * @memberof! OfflineCacheManager
     * @instance
     * @return {Promise} Returns a Promise that resolves to an array of the
     *                   OfflineCache names managed by this OfflineCacheManager.
     */
    OfflineCacheManager.prototype.keys = function () {
      var keysArray = [];
      for (var i = 0; i < this._cachesArray.length; i++) {
        keysArray.push(this._cachesArray[i].getName());
      }
      return Promise.resolve(keysArray);
    };

    return new OfflineCacheManager();
  });