/**
 * @license
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */
/**
 * Copyright (c) 2018, Oracle and/or its affiliates.
 * All rights reserved.
 */

define(['require', '../persistenceUtils', '../persistenceStoreManager', './defaultCacheHandler', './logger'],
  function (require, persistenceUtils, persistenceStoreManager, cacheHandler, logger) {
    'use strict';

    function PersistenceSyncManager(isOnline, browserFetch, cache) {
      Object.defineProperty(this, '_eventListeners', {
        value: [],
        writable: true
      });
      Object.defineProperty(this, '_isOnline', {
        value: isOnline
      });
      Object.defineProperty(this, '_browserFetch', {
        value: browserFetch
      });
      Object.defineProperty(this, '_cache', {
        value: cache
      });
    };

    PersistenceSyncManager.prototype.addEventListener = function (type, listener, scope) {
      this._eventListeners.push({type: type.toLowerCase(), listener: listener, scope: scope});
    };
    
    PersistenceSyncManager.prototype.removeEventListener = function (type, listener, scope) {
      this._eventListeners = this._eventListeners.filter(function (eventListener) {
        if (type.toLowerCase() == eventListener.type &&
          listener == eventListener.listener &&
          scope == eventListener.scope) {
          return false;
        }
        return true;
      });
    };

    PersistenceSyncManager.prototype.getSyncLog = function () {
      // if we're already reading the sync log then just return the promise
      if (!this._readingSyncLog)
      {
        this._readingSyncLog = _getSyncLog(this);
      }
      return this._readingSyncLog;
    };

    function _getSyncLog(persistenceSyncManager) {
      var self = persistenceSyncManager;
      return new Promise(function (resolve, reject) {
        _findSyncLogRecords().then(function (results) {
          return _generateSyncLog(results);
        }).then(function (syncLog) {
          self._readingSyncLog = null;
          resolve(syncLog);
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    PersistenceSyncManager.prototype.insertRequest = function (request, options) {
      return new Promise(function (resolve, reject) {
        var localVars = {};

        _getSyncLogStorage().then(function (store) {
          localVars.store = store;
          return persistenceUtils.requestToJSON(request, {'_noClone': true});
        }).then(function (requestData) {
          localVars.requestData = requestData;
          localVars.metadata = cacheHandler.constructMetadata(request);
          localVars.requestId = localVars.metadata.created.toString();
          return localVars.store.upsert(localVars.requestId, localVars.metadata, localVars.requestData);
        }).then(function () {
          if (options != null) {
            var undoRedoDataArray = options.undoRedoDataArray;

            if (undoRedoDataArray != null) {
              _getRedoUndoStorage().then(function (redoUndoStore) {
                var storeUndoRedoData = function (i) {
                  if (i < undoRedoDataArray.length &&
                    undoRedoDataArray[i] != null) {
                    redoUndoStore.upsert(localVars.requestId, localVars.metadata, undoRedoDataArray[i]).then(function () {
                      storeUndoRedoData(++i);
                    });
                  } else {
                    resolve();
                  }
                };
                storeUndoRedoData(0);
              });
            } else {
              resolve();
            }
          } else {
            resolve();
          }
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    PersistenceSyncManager.prototype.removeRequest = function (requestId) {
      var self = this;
      return new Promise(function (resolve, reject) {
        var localVars = {};
        _getSyncLogStorage().then(function (store) {
          localVars.store = store;
          return _getRequestFromSyncLog(self, requestId);
        }).then(function (request) {
          localVars.request = request;
          return localVars.store.removeByKey(requestId);
        }).then(function () {
          // Also remove the redo/undo data
          return _getRedoUndoStorage();
        }).then(function (redoUndoStore) {
          return redoUndoStore.removeByKey(requestId);
        }).then(function () {
          resolve(localVars.request);
        }).catch(function (err) {
          reject(err);
        });
      });
    };
    
    PersistenceSyncManager.prototype.updateRequest = function (requestId, request) {
      return Promise.all([_getSyncLogStorage(), 
        persistenceUtils.requestToJSON(request)]
        ).then(function (values) {
        var store = values[0];
        var requestData = values[1];
        var metadata = cacheHandler.constructMetadata(request);
        return store.upsert(requestId, metadata, requestData);
      });
    };

    PersistenceSyncManager.prototype.sync = function (options) {
      this._options = options || {};
      var self = this;
      if (this._syncing) {
        return Promise.reject('Cannot start sync while sync is in progress');
      }
      this._syncing = true;
      var syncPromise = new Promise(function (resolve, reject) {
        self.getSyncLog().then(function (value) {
          if (self._isOnline()) {
            var requestId, request, requestClone, statusCode;

            var replayRequestArray = function (requests) {
              if (requests.length == 0) {
                resolve();
              }
              if (requests.length > 0) {
                requestId = requests[0].requestId;
                request = requests[0].request;
                // we need to clone the request before sending it off so we
                // can return it later in case of error
                requestClone = request.clone();
                _dispatchEvent(self, 'beforeSyncRequest', {'requestId': requestId,
                  'request': requestClone.clone()},
                  request.url).then(function (eventResult) {
                  if (_checkStopSync(eventResult)) {
                    resolve();
                    return;
                  }
                  eventResult = eventResult || {};
                  if (eventResult.action !== 'skip') {
                    if (eventResult.action === 'replay') {
                      // replay the provided request instead of what's in the sync log
                      request = eventResult.request;
                    }                  
                    requestClone = request.clone();
                    _checkURL(self, request).then(function() {
                      self._browserFetch(request).then(function (response) {
                        statusCode = response.status;

                        // fail for HTTP error codes 4xx and 5xx
                        if (statusCode >= 400) {
                          reject({'error': response.statusText,
                            'requestId': requestId,
                            'request': requestClone.clone(),
                            'response': response.clone()});
                          return;
                        }
                        persistenceUtils._cloneResponse(response).then(function(responseClone) {
                          _dispatchEvent(self, 'syncRequest', {'requestId': requestId,
                            'request': requestClone.clone(),
                            'response': responseClone.clone()},
                            request.url).then(function (dispatchEventResult) {
                            if (!_checkStopSync(dispatchEventResult)) {
                              self.removeRequest(requestId).then(function () {
                                requests.shift();
                                if (request.method == 'GET' ||
                                  request.method == 'HEAD') {
                                  persistenceUtils._cloneResponse(responseClone).then(function(responseClone) {
                                    self._cache().put(request, responseClone).then(function () {
                                      logger.log("replayed request/response is cached.");
                                      replayRequestArray(requests);
                                    });
                                  });
                                } else {
                                  replayRequestArray(requests);
                                }
                              }, function (err) {
                                reject({'error': err, 'requestId': requestId, 'request': requestClone.clone()});
                              });
                            } else {
                              resolve();
                            }
                          });
                        });
                      }, function (err) {
                        reject({'error': err, 'requestId': requestId, 'request': requestClone.clone()});
                      });
                    }, function(err) {
                      if (err === false) {
                        // timeout
                        var init = {'status': 504, 'statusText': 'Preflight OPTIONS request timed out'};
                        reject({'error': 'Preflight OPTIONS request timed out', 'requestId': requestId, 'request': requestClone.clone(), 'response': new Response(null, init)});
                      } else {
                        reject({'error': err, 'requestId': requestId, 'request': requestClone.clone()});
                      }
                    });
                  } else {
                    // skipping, just remove the request and carry on
                    self.removeRequest(requestId).then(function () {
                      requests.shift();
                      replayRequestArray(requests);
                    }, function (err) {
                      reject({'error': err, 'requestId': requestId, 'request': requestClone.clone()});
                    });
                  }
                });
              }
            };
            value = _reorderSyncLog(value);
            replayRequestArray(value);
          } else {
            resolve();
          }
        }, function (err) {
          reject(err);
        });
      });
      return new Promise(function (resolve, reject) {
        syncPromise.then(function (value) {
          self._syncing = false;
          self._pingedURLs = null;
          resolve(value);
        }, function (err) {
          self._syncing = false;
          self._pingedURLs = null;
          reject(err);
        });
      });
    };
    
    function _checkURL(persistenceSyncManager, request) {
      // send an OPTIONS request to the server to see if it's reachable
      var self = persistenceSyncManager;
      var preflightOptionsRequestOption = self._options['preflightOptionsRequest'];
      var preflightOptionsRequestTimeoutOption = self._options['preflightOptionsRequestTimeout'];
      if (request.url != null &&
        preflightOptionsRequestOption != 'disabled' &&
        request.url.match(preflightOptionsRequestOption) != null) {
        if (!self._pingedURLs) {
          self._pingedURLs = [];
        } else if (self._pingedURLs.indexOf(request.url) >= 0) {
          return Promise.resolve(true);
        }
        self._preflightOptionsRequestId = new Date().getTime();
        return new Promise(function(preflightOptionsRequestId) {
          return function(resolve, reject) {
            self._repliedOptionsRequest = false;
            var preflightOptionsRequest = new Request(request.url, {method: 'OPTIONS'});
            var requestTimeout = 60000;
            if(preflightOptionsRequestTimeoutOption != null) {
              requestTimeout = preflightOptionsRequestTimeoutOption;
            }
            setTimeout(function() 
            {
              if (!self._repliedOptionsRequest &&
                self._preflightOptionsRequestId == preflightOptionsRequestId) {
                reject(false);
              }
            }, requestTimeout);
            self._browserFetch(preflightOptionsRequest).then(function(result) {
              self._repliedOptionsRequest = true;
              if (!self._pingedURLs) {
                self._pingedURLs = [];
              }
              self._pingedURLs.push(request.url);
              resolve(true);
            }, function(err) {
              // if an error returns then the server may be rejecting OPTIONS
              // requests. That's ok.
              self._repliedOptionsRequest = true;
              resolve(true);
            });
          }
        }(self._preflightOptionsRequestId));
      }
      return Promise.resolve(true);
    };
    
    function _checkStopSync(syncEventResult) {
      syncEventResult = syncEventResult || {};
      return syncEventResult.action === 'stop';
    };

    function _reorderSyncLog(requestObjArray) {
      // re-order the sync log so that the
      // GET requests are at the end
      if (requestObjArray &&
        requestObjArray.length > 0) {
        var reorderedRequestObjArray = [];
        var i;
        var request;

        for (i = 0; i < requestObjArray.length; i++) {
          request = requestObjArray[i].request;

          if (request.method != 'GET' &&
            request.method != 'HEAD') {
            reorderedRequestObjArray.push(requestObjArray[i]);
          }
        }
        for (i = 0; i < requestObjArray.length; i++) {
          request = requestObjArray[i].request;

          if (request.method == 'GET' ||
            request.method == 'HEAD') {
            reorderedRequestObjArray.push(requestObjArray[i]);
          }
        }
        return reorderedRequestObjArray;
      }
      return requestObjArray;
    };

    function _createSyncLogEntry(requestId, request) {
      return {'requestId': requestId,
        'request': request,
        'undo': function () {
          return _undoLocalStore(requestId);
        },
        'redo': function () {
          return _redoLocalStore(requestId);
        }};
    };

    function _findSyncLogRecords() {
      return new Promise(function (resolve, reject) {
        _getSyncLogStorage().then(function (store) {
          return store.find(_getSyncLogFindExpression());
        }).then(function (results) {
          resolve(results);
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    function _generateSyncLog(results) {
      return new Promise(function (resolve, reject) {
        var syncLogArray = [];
        var requestId;
        var requestData;
        var getRequestArray = function (requestDataArray) {
          if (!requestDataArray ||
            requestDataArray.length == 0) {
            resolve(syncLogArray);
          } else {
            requestId = requestDataArray[0].metadata.created.toString();
            requestData = requestDataArray[0].value;
            persistenceUtils.requestFromJSON(requestData).then(function (request) {
              syncLogArray.push(_createSyncLogEntry(requestId, request));
              requestDataArray.shift();
              getRequestArray(requestDataArray);
            }, function (err) {
              reject(err);
            });
          }
        };
        getRequestArray(results);
      });
    };

    function _getRequestFromSyncLog(persistenceSyncManager, requestId) {
      var self = persistenceSyncManager;
      return new Promise(function (resolve, reject) {
        self.getSyncLog().then(function (syncLog) {
          var i;
          var request;
          var syncLogCount = syncLog.length;
          for (i = 0; i < syncLogCount; i++) {
            if (syncLog[i].requestId === requestId) {
              request = syncLog[i].request;
              resolve(request);
              break;
            }
          }
        }, function (err) {
          reject(err);
        });
      });
    };

    function _getSyncLogFindExpression() {
      var findExpression = {};
      var fieldsExpression = [];
      var sortExpression = [];
      sortExpression.push('metadata.created');
      findExpression.sort = sortExpression;
      fieldsExpression.push('metadata.created');
      fieldsExpression.push('value');
      findExpression.fields = fieldsExpression;
      var selectorExpression = {};
      var existsExpression = {};
      existsExpression['$exists'] = true;
      selectorExpression['metadata.created'] = existsExpression;
      findExpression.selector = selectorExpression;

      return findExpression;
    };

    function _redoLocalStore(requestId) {
      return new Promise(function (resolve, reject) {
        _getRedoUndoStorage().then(function (redoUndoStore) {
          return redoUndoStore.findByKey(requestId);
        }).then(function (redoUndoDataArray) {
          if (redoUndoDataArray != null) {
            _updateLocalStore(redoUndoDataArray, false).then(function () {
              resolve(true);
            });
          } else {
            resolve(false);
          }
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    function _undoLocalStore(requestId) {
      return new Promise(function (resolve, reject) {
        _getRedoUndoStorage().then(function (redoUndoStore) {
          return redoUndoStore.findByKey(requestId);
        }).then(function (redoUndoDataArray) {
          if (redoUndoDataArray != null) {
            _updateLocalStore(redoUndoDataArray, true).then(function () {
              resolve(true);
            });
          } else {
            resolve(false);
          }
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    function _updateLocalStore(redoUndoDataArray, isUndo) {
      return new Promise(function (resolve, reject) {
        var j, dataArray = [], operation, storeName, undoRedoData, undoRedoDataCount;
        var redoUndoDataArrayCount = redoUndoDataArray.length;
        var applyUndoRedoItem = function (i) {
          if (i < redoUndoDataArrayCount) {
            storeName = redoUndoDataArray[i].storeName;
            operation = redoUndoDataArray[i].operation;

            if (operation == 'upsert') {
              // bunch up the upserts so we can do them in bulk using upsertAll
              undoRedoData = redoUndoDataArray[i].undoRedoData;

              dataArray = [];
              undoRedoDataCount = undoRedoData.length;
              for (j = 0; j < undoRedoDataCount; j++) {
                if (isUndo) {
                  dataArray.push({'key': undoRedoData[j].key, 'value': undoRedoData[j].undo});
                } else {
                  dataArray.push({'key': undoRedoData[j].key, 'value': undoRedoData[j].redo});
                }
              }

              persistenceStoreManager.openStore(storeName).then(function (store) {
                store.upsertAll(dataArray).then(function () {
                  applyUndoRedoItem(++i);
                });
              });
            } else if (operation == 'remove') {
              // remove will only contain one entry in the undoRedoData array
              persistenceStoreManager.openStore(storeName).then(function (store) {
                store.removeByKey(undoRedoData[0].key).then(function () {
                  applyUndoRedoItem(++i);
                });
              });
            }
          } else {
            resolve();
          }
        };
        applyUndoRedoItem(0);
      });
    };

    function _dispatchEvent(persistenceSyncManager, eventType, event, url) {
      var self = persistenceSyncManager;
      var filteredEventListeners = self._eventListeners.filter(_eventFilterFunction(eventType, url));
      return _callEventListener(event, filteredEventListeners);
    };

    function _eventFilterFunction(eventType, url) {
      return function (eventListener) {
        return eventType.toLowerCase() == eventListener.type &&
          (url != null && url.match(eventListener.scope) ||
            url == null || eventListener.scope == null);
      };
    };
    
    function _callEventListener(event, eventListeners) {
      if (eventListeners.length > 0) {
        return eventListeners[0].listener(event).then(function (result) {
          if (result != null) {
            return Promise.resolve(result);
          }
          if (eventListeners.length > 1) {
            return _callEventListener(eventListeners.slice(1));
          }
        });
      }
      return Promise.resolve(null);
    };

    function _getStorage(name) {
      return new Promise(function (resolve, reject) {
        var options = {index: ['metadata.created']};
        persistenceStoreManager.openStore(name, options).then(function (store) {
          resolve(store);
        }).catch(function (err) {
          reject(err);
        });
      });
    };

    function _getSyncLogStorage() {
      return _getStorage('syncLog');
    };

    function _getRedoUndoStorage() {
      return _getStorage('redoUndoLog');
    };

    return PersistenceSyncManager;
  });

