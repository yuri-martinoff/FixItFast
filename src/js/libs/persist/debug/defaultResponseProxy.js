/**
 * @license
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */
/**
 * Copyright (c) 2018, Oracle and/or its affiliates.
 * All rights reserved.
 */

define(['./persistenceManager', './persistenceUtils', './fetchStrategies',
  './cacheStrategies', './persistenceStoreManager', './impl/defaultCacheHandler'],
  function (persistenceManager, persistenceUtils, fetchStrategies,
    cacheStrategies, persistenceStoreManager, cacheHandler) {
    'use strict';

    /**
     * Default Response Proxy
     * @export
     * @class DefaultResponseProxy
     * @classdesc  Provides a fetch event listener which uses the default Fetch and Cache strategies.
     * @constructor
     * @param {{jsonProcessor: Object, fetchStrategy: Function, cacheStrategy: Function}=} options Options
     */
    function DefaultResponseProxy(options) {
      options = options || {};

      if (options['fetchStrategy'] == null) {
        options['fetchStrategy'] = fetchStrategies.getCacheIfOfflineStrategy();
      }
      if (options['cacheStrategy'] == null) {
        options['cacheStrategy'] = cacheStrategies.getHttpCacheHeaderStrategy();
      }
      options.requestHandlerOverride = options.requestHandlerOverride || {};

      if (options['requestHandlerOverride']['handleGet'] == null) {
        options['requestHandlerOverride']['handleGet'] = this.handleGet;
      }
      if (options['requestHandlerOverride']['handlePost'] == null) {
        options['requestHandlerOverride']['handlePost'] = this.handlePost;
      }
      if (options['requestHandlerOverride']['handlePut'] == null) {
        options['requestHandlerOverride']['handlePut'] = this.handlePut;
      }
      if (options['requestHandlerOverride']['handlePatch'] == null) {
        options['requestHandlerOverride']['handlePatch'] = this.handlePatch;
      }
      if (options['requestHandlerOverride']['handleDelete'] == null) {
        options['requestHandlerOverride']['handleDelete'] = this.handleDelete;
      }
      if (options['requestHandlerOverride']['handleHead'] == null) {
        options['requestHandlerOverride']['handleHead'] = this.handleHead;
      }
      if (options['requestHandlerOverride']['handleOptions'] == null) {
        options['requestHandlerOverride']['handleOptions'] = this.handleOptions;
      }
      Object.defineProperty(this, '_options', {
        value: options
      });
    };

     /**
     * Return an instance of the default response proxy
     * @method
     * @name getResponseProxy
     * @param {{jsonProcessor: Object, fetchStrategy: Function, cacheStrategy: Function}=} options Options
     * <ul>
     * <li>options.jsonProcessor An object containing the JSON shredder, unshredder, and queryHandler for the responses.</li>
     * <li>options.jsonProcessor.shredder JSON shredder for the responses</li>
     * <li>options.jsonProcessor.unshredder JSON unshredder for the responses</li>
     * <li>options.queryHandler query parameter handler. Should be a function which takes a
     *                          Request and returns a Promise which resolves with a Response
     *                          when the query parameters have been processed. If the Request
     *                          was not handled then resolve to null.</li>
     * <li>options.fetchStrategy Should be a function which takes a
     *                   Request and returns a Promise which resolves to a Response
     *                   If unspecified then uses the default.</li>
     * <li>options.cacheStrategy Should be a function which returns a Promise which
     *                   resolves with a response when the cache expiration behavior has been processed.
     *                   If unspecified then uses the default which
     *                   uses the HTTP cache headers to determine cache expiry.</li>
     * <li>options.requestHandlerOverride An object containing request handler overrides.</li>
     * <li>options.requestHandlerOverride.handleGet Override the default GET request handler with the supplied function.
     * The function should take a Request object as parameter and return a Promise which resolves to a Response object.</li>
     * <li>options.requestHandlerOverride.handlePost Override the default POST request handler with the supplied function.
     * The function should take a Request object as parameter and return a Promise which resolves to a Response object.</li>
     * <li>options.requestHandlerOverride.handlePut Override the default PUT request handler with the supplied function.
     * The function should take a Request object as parameter and return a Promise which resolves to a Response object.</li>
     * <li>options.requestHandlerOverride.handlePatch Override the default PATCH request handler with the supplied function.
     * The function should take a Request object as parameter and return a Promise which resolves to a Response object.</li>
     * <li>options.requestHandlerOverride.handleDelete Override the default DELETE request handler with the supplied function.
     * The function should take a Request object as parameter and return a Promise which resolves to a Response object.</li>
     * <li>options.requestHandlerOverride.handleHead Override the default HEAD request handler with the supplied function.
     * The function should take a Request object as parameter and return a Promise which resolves to a Response object.</li>
     * <li>options.requestHandlerOverride.handleOptions Override the default OPTIONS request handler with the supplied function.
     * The function should take a Request object as parameter and return a Promise which resolves to a Response object.</li>
     * </ul>
     * @export
     * @instance
     * @memberof! DefaultResponseProxy
     */
    function getResponseProxy(options) {
      return new DefaultResponseProxy(options);
    };

    /**
     * Returns the Fetch Event listener
     * @method
     * @name getFetchEventListener
     * @return {Function} Returns the fetch event listener
     * @export
     * @instance
     * @memberof! DefaultResponseProxy
     */
    DefaultResponseProxy.prototype.getFetchEventListener = function () {
      var self = this;
      return function (event) {
        event.respondWith(new Promise(function (resolve, reject) {
          self.processRequest(event.request).then(function (response) {
            resolve(response);
          }, function(err) {
            reject(err);
          }).catch(function (err) {
            reject(err);
          });
        }));
      };
    };

    /**
     * Process the Request. Use this function if you want to chain request
     * processing within a fetch event listener.
     * @method
     * @name processRequest
     * @param {Request} request Request object
     * @return {Function} Promise
     * @export
     * @instance
     * @memberof! DefaultResponseProxy
     */
    DefaultResponseProxy.prototype.processRequest = function (request) {
      var self = this;
      var endpointKey = persistenceUtils.buildEndpointKey(request);
      return new Promise(function (resolve, reject) {
        // set the shredder/unshredder information
        cacheHandler.registerEndpointOptions(endpointKey, self._options);
        var requestHandler = _getRequestHandler(self, request);
        var localVars = {};
        var requestClone = request.clone();
        requestHandler.call(self, request).then(function (response) {
          if (persistenceUtils.isCachedResponse(response)) {
            localVars.isCachedResponse = true;
          }
          if (response.ok) {
            return _applyCacheStrategy(self, request, response);
          } else {
            return Promise.resolve(response);
          }
        }).then(function (response) {
          localVars.response = response;
          if (response.ok) {
            // cache the shredded data
            return _cacheShreddedData(request, response);
          } else {
            return Promise.resolve(null);
          }
        }).then(function (undoRedoDataArray) {
          return _insertSyncManagerRequest(request, undoRedoDataArray, localVars.isCachedResponse);
        }).then(function () {
          cacheHandler.unregisterEndpointOptions(endpointKey);
          resolve(localVars.response);
        }).catch(function (err) {
          _insertSyncManagerRequest(requestClone, null, true).then(function() {
            cacheHandler.unregisterEndpointOptions(endpointKey);
            reject(err); 
          }, function() {
            cacheHandler.unregisterEndpointOptions(endpointKey);
            reject(err); 
          });
        });
      });
    };

    function _getRequestHandler(defaultResponseProxy, request) {
      var self = defaultResponseProxy;
      var options = self._options;
      var requestHandler = null;

      if (request.method === 'POST') {
        requestHandler = options['requestHandlerOverride']['handlePost'];
      } else if (request.method === 'GET') {
        requestHandler = options['requestHandlerOverride']['handleGet'];
      } else if (request.method === 'PUT') {
        requestHandler = options['requestHandlerOverride']['handlePut'];
      } else if (request.method === 'PATCH') {
        requestHandler = options['requestHandlerOverride']['handlePatch'];
      } else if (request.method === 'DELETE') {
        requestHandler = options['requestHandlerOverride']['handleDelete'];
      } else if (request.method === 'HEAD') {
        requestHandler = options['requestHandlerOverride']['handleHead'];
      } else if (request.method === 'OPTIONS') {
        requestHandler = options['requestHandlerOverride']['handleOptions'];
      }
      return requestHandler;
    };

    /**
     * The default POST request handler.
     * The default implementation when offline will return a Response with
     * '503 Service Unavailable' error code.
     * @method
     * @name handlePost
     * @param {Request} request Request object
     * @return {Promise} Returns a Promise which resolves to a Response object
     * @export
     * @instance
     * @memberof! DefaultResponseProxy
     */
    DefaultResponseProxy.prototype.handlePost = function (request) {
      return _handleRequestWithErrorIfOffline(request);
    };

    function _handleRequestWithErrorIfOffline(request) {
      if (!persistenceManager.isOnline()) {
        var init = {'status': 503, 'statusText': 'Must provide handlePost override for offline'};
        return Promise.resolve(new Response(null, init));
      } else {
        return persistenceManager.browserFetch(request);
      }
    };

    /**
     * The default GET request handler.
     * Processes the GET Request using the default logic. Can be overrided to provide
     * custom processing logic.
     * @method
     * @name handleGet
     * @param {Request} request Request object
     * @return {Promise} Returns a Promise which resolves to a Response object
     * @export
     * @instance
     * @memberof! DefaultResponseProxy
     */
    DefaultResponseProxy.prototype.handleGet = function (request) {
      return _handleGetWithFetchStrategy(this, request);
    };

    function _handleGetWithFetchStrategy(defaultResponseProxy, request) {
      var self = defaultResponseProxy;
      var fetchStrategy = self._options['fetchStrategy'];

      return new Promise(function (resolve, reject) {
        fetchStrategy(request, self._options).then(function (fetchResponse) {
          resolve(fetchResponse);
        }).catch(function (err) {
          reject(err);
        });
      });
    };
    
    /**
     * The default HEAD request handler.
     * Processes the HEAD Request using the default logic. Can be overrided to provide
     * custom processing logic.
     * @method
     * @name handleHead
     * @param {Request} request Request object
     * @return {Promise} Returns a Promise which resolves to a Response object
     * @export
     * @instance
     * @memberof! DefaultResponseProxy
     */
    DefaultResponseProxy.prototype.handleHead = function (request) {
      return _handleGetWithFetchStrategy(this, request);
    };
    
    /**
     * The default OPTIONS request handler.
     * The default implementation when offline will return a Response with
     * '503 Service Unavailable' error code.
     * @method
     * @name handleOptions
     * @param {Request} request Request object
     * @return {Promise} Returns a Promise which resolves to a Response object
     * @export
     * @instance
     * @memberof! DefaultResponseProxy
     */
    DefaultResponseProxy.prototype.handleOptions = function (request) {
      return _handleRequestWithErrorIfOffline(request);
    };

    /**
     * The default PUT request handler.
     * Processes the PUT Request using the default logic. Can be overrided to provide
     * custom processing logic.
     * @method
     * @name handlePut
     * @param {Request} request Request object
     * @return {Promise} Returns a Promise which resolves to a Response object
     * @export
     * @instance
     * @memberof! DefaultResponseProxy
     */
    DefaultResponseProxy.prototype.handlePut = function (request) {
      return _handlePutRequest(this, request);
    };

    function _handlePutRequest(defaultResponseProxy, request) {
      var self = defaultResponseProxy;
      if (persistenceManager.isOnline()) {
        return new Promise(function (resolve, reject) {
          persistenceManager.browserFetch(request.clone()).then(function (response) {
            // check for response.ok. That indicates HTTP status in the 200-299 range
            if (response.ok) {
              resolve(response);
            } else {
              return _handleResponseNotOk(self, request, response, _handleOfflinePutRequest);
            }
          }, function (err) {
            return _handleOfflinePutRequest(self, request);
          }).then(function (response) {
            if (response) {
              resolve(response);
            }
          }).catch(function (err) {
            reject(err);
          });
        });
      } else {
        return _handleOfflinePutRequest(self, request);
      }
    };

    function _handleOfflinePutRequest(defaultResponseProxy, request) {
      return new Promise(function (resolve, reject) {
        // first we convert the Request obj to JSON and then we create a
        // a Response obj from that JSON. Request/Response objs have similar
        // properties so that is equivalent to creating a Response obj by
        // copying over Request obj values.
        persistenceUtils.requestToJSON(request).then(function (requestData) {
          requestData.status = 200;
          requestData.statusText = 'OK';
          requestData.headers['content-type'] = 'application/json';
          requestData.headers['x-oracle-jscpt-cache-expiration-date'] = '';

          // if the request contains an ETag then we have to generate a new one
          var ifMatch = requestData.headers['if-match'];
          var ifNoneMatch = requestData.headers['if-none-match'];

          if (ifMatch || ifNoneMatch) {
            var randomInt = Math.floor(Math.random() * 1000000);
            requestData.headers['etag'] = (Date.now() + randomInt).toString();
            requestData.headers['x-oracle-jscpt-etag-generated'] = requestData.headers['etag'];
            delete requestData.headers['if-match'];
            delete requestData.headers['if-none-match'];
          }

          persistenceUtils.responseFromJSON(requestData).then(function (response) {
            resolve(response);
          });
        });
      });
    };

    /**
     * The default PATCH request handler.
     * The default implementation when offline will return a Response with
     * '503 Service Unavailable' error code.
     * @method
     * @name handlePatch
     * @param {Request} request Request object
     * @return {Promise} Returns a Promise which resolves to a Response object
     * @export
     * @instance
     * @memberof! DefaultResponseProxy
     */
    DefaultResponseProxy.prototype.handlePatch = function (request) {
      return _handleRequestWithErrorIfOffline(request);
    };

    /**
     * The default DELETE request handler.
     * Processes the DELETE Request using the default logic. Can be overridden to provide
     * custom processing logic.
     * @method
     * @name handleDelete
     * @param {Request} request Request object
     * @return {Promise} Returns a Promise which resolves to a Response object
     * @export
     * @instance
     * @memberof! DefaultResponseProxy
     */
    DefaultResponseProxy.prototype.handleDelete = function (request) {
      return _handleDeleteRequest(this, request);
    };

    function _handleDeleteRequest(defaultResponseProxy, request) {
      var self = defaultResponseProxy;
      if (persistenceManager.isOnline()) {
        return new Promise(function (resolve, reject) {
          persistenceManager.browserFetch(request.clone()).then(function (response) {
            // check for response.ok. That indicates HTTP status in the 200-299 range
            if (response.ok) {
              resolve(response);
            } else {
              return _handleResponseNotOk(self, request, response, _handleOfflineDeleteRequest);
            }
          }, function (err) {
            return _handleOfflineDeleteRequest(self, request);
          }).then(function (response) {
            if (response) {
              resolve(response);
            }
          }).catch(function (err) {
            reject(err);
          });
        });
      } else {
        return _handleOfflineDeleteRequest(self, request);
      }
    };

    function _handleOfflineDeleteRequest(defaultResponseProxy, request) {
      var self = defaultResponseProxy;
      return new Promise(function (resolve, reject) {
        // first we convert the Request obj to JSON and then we create a
        // a Response obj from that JSON. Request/Response objs have similar
        // properties so that is equivalent to creating a Response obj by
        // copying over Request obj values.
        persistenceUtils.requestToJSON(request).then(function (requestData) {
          requestData.status = 200;
          requestData.statusText = 'OK';
          requestData.headers['content-type'] = 'application/json';
          requestData.headers['x-oracle-jscpt-cache-expiration-date'] = '';
          persistenceUtils.responseFromJSON(requestData).then(function (response) {
            // for DELETE requests, we don't have data in the payload but
            // the response does so we have to get the data from the shredded
            // store to construct a response.
            // the DELETE key is in the URL
            var key = _getRequestUrlId(request);
            // query for the data
            var jsonShredder = null;

            if (self._options && self._options.jsonProcessor &&
              self._options.jsonProcessor.shredder) {
              jsonShredder = self._options.jsonProcessor.shredder;
            }

            if (jsonShredder) {
              jsonShredder(response).then(function (shreddedObjArray) {
                if (shreddedObjArray) {
                  // only look at the first one
                  var storeName = shreddedObjArray[0]['name'];
                  persistenceStoreManager.openStore(storeName).then(function (store) {
                    store.findByKey(key).then(function (row) {
                      // set the payload with the data we got from the shredded store
                      if (row) {
                        persistenceUtils.responseFromJSON(requestData).then(function (response) {
                          persistenceUtils.setResponsePayload(response, row).then(function (response) {
                            resolve(response);
                            return;
                          });
                        });
                      }
                    });
                  });
                }
              });
            } else {
              // if we don't have shredded data then just resolve. The Response obj payload
              // will be empty but that's the best we can do.
              resolve(response);
            }
          });
        });
      });
    };

    function _handleResponseNotOk(defaultResponseProxy, request, response, offlineHandler) {
      var self = defaultResponseProxy;
      return new Promise(function (resolve, reject) {
        // for 300-499 range, we should not fetch from cache.
        // 300-399 are redirect errors
        // 400-499 are client errors which should be handled by the client
        if (response.status < 500) {
          resolve(response);
        } else {
          // 500-599 are server errors so we can fetch from cache
          offlineHandler(self, request).then(function (response) {
            resolve(response);
          }, function (err) {
            reject(err)
          });
        }
      });
    };

    function _getRequestUrlId(request) {
      var urlTokens = request.url.split('/');
      return urlTokens[urlTokens.length - 1];
    };

    function _applyCacheStrategy(defaultResponseProxy, request, response) {
      var self = defaultResponseProxy;
      if (request.method === 'GET' ||
        request.method === 'HEAD') {
        var cacheStrategy = self._options['cacheStrategy'];
        return cacheStrategy(request, response, self._options);
      } else {
        return Promise.resolve(response);
      }
    };

    function _insertSyncManagerRequest(request, undoRedoDataArray, force) {
      if (!persistenceManager.isOnline() || force) {
        // put the request in the sync manager if offline or if force is true
        return persistenceManager.getSyncManager().insertRequest(request, {'undoRedoDataArray': undoRedoDataArray});
      }
      return Promise.resolve();
    };

    function _cacheShreddedData(request, response) {
      return new Promise(function (resolve, reject) {
        if (request.method == 'GET' ||
          request.method == 'HEAD') {
          persistenceManager.getCache().hasMatch(request, {ignoreSearch: true}).then(function (matchExist) {
            if (matchExist) {
              // the cache strategy would have cached the response unless
              // response is not to be stored, e.g. no-store. In that case we don't want
              // to shred
              _processShreddedData(request, response).then(function (undoRedoData) {
                resolve(undoRedoData);
              }, function (err) {
                reject(err);
              });
            } else {
              resolve();
            }
          });
        } else {
          _processShreddedData(request, response).then(function (undoRedoData) {
            resolve(undoRedoData);
          }, function (err) {
            reject(err);
          });
        }
      });
    };

    function _processShreddedData(request, response) {
      return new Promise(function (resolve, reject) {
        cacheHandler.constructShreddedData(request, response).then(function (shreddedData) {
          if (shreddedData) {
            // if we have shredded data then update the local store with it
            return _updateShreddedDataStore(request, shreddedData);
          } else {
            return Promise.resolve();
          }
        }).then(function (undoRedoData) {
          resolve(undoRedoData);
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    function _updateShreddedDataStore(request, shreddedData) {
      var promises = [];
      shreddedData.forEach(function (shreddedDataItem) {
        var storename = Object.keys(shreddedDataItem)[0];
        promises.push(_updateShreddedDataStoreForItem(request, storename, shreddedDataItem[storename]));
      });

      return Promise.all(promises);
    };

    function _updateShreddedDataStoreForItem(request, storename, shreddedDataItem) {
      return new Promise(function (resolve, reject) {
        _getUndoRedoDataForShreddedDataItem(request, storename, shreddedDataItem).then(function (undoRedoArray) {
          if (request.method === 'DELETE') {
            return _updateShreddedDataStoreForDeleteRequest(storename, shreddedDataItem, undoRedoArray);
          } else {
            return _updateShreddedDataStoreForNonDeleteRequest(storename, shreddedDataItem, undoRedoArray);
          }
        }).then(function (undoRedoData) {
          resolve(undoRedoData);
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    function _getUndoRedoDataForShreddedDataItem(request, storename, shreddedDataItem) {
      return new Promise(function (resolve, reject) {
        var undoRedoArray = [];
        var key;
        var value;

        var undoRedoData = function (i, dataArray) {
            // we should not have any undoRedo data for GET requests
            if (i < dataArray.length &&
              request.method !== 'GET' &&
              request.method !== 'HEAD') {
              key = dataArray[i]['key'].toString();

              if (request.method !== 'DELETE') {
                value = dataArray[i]['value'];
              } else {
                // redo data is null for DELETE
                value = null;
              }

              // find the existing data so we can get the undo data
            persistenceStoreManager.openStore(storename).then(function (store) {
              store.findByKey(key).then(function (undoRow) {
                undoRedoArray.push({'key': key, 'undo': undoRow, 'redo': value});
                undoRedoData(++i, dataArray);
              }, function (error) {
                // if there is no existing data then undo is null
                undoRedoArray.push({'key': key, 'undo': null, 'redo': value});
                undoRedoData(++i, dataArray);
              });
            });
            } else {
              resolve(undoRedoArray);
            }
          };
            undoRedoData(0, shreddedDataItem);
          });
    };

    function _updateShreddedDataStoreForNonDeleteRequest(storename, shreddedDataItem, undoRedoArray) {
      return new Promise(function (resolve, reject) {
        // for other requests, upsert the shredded data
        persistenceStoreManager.openStore(storename).then(function (store) {
          return store.upsertAll(shreddedDataItem);
        }).then(function () {
          if (undoRedoArray.length > 0) {
            resolve({'storeName': storename, 'operation': 'upsert', 'undoRedoData': undoRedoArray});
          } else {
            resolve();
          }
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    function _updateShreddedDataStoreForDeleteRequest(storename, shreddedDataItem, undoRedoArray) {
      return new Promise(function (resolve, reject) {
        // for DELETE requests, simple remove the existing shredded data
        persistenceStoreManager.openStore(storename).then(function (store) {
          return store.removeByKey(shreddedDataItem[0]['key']);
        }).then(function () {
          if (undoRedoArray.length > 0) {
            resolve({'storeName': storename, 'operation': 'remove', 'undoRedoData': undoRedoArray});
          } else {
            resolve();
          }
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    return {'getResponseProxy': getResponseProxy};
  });

