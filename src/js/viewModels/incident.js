/**
 * @license
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */
/**
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */
'use strict';
define(['ojs/ojcore', 'knockout', 'jquery', 'dataService', 'appController', 'ojs/ojknockout'], function(oj, ko, $, data, app) {
  function incidentViewModel() {
    var self = this;

    self.incidentData = ko.observable();
    self.moduleConfig = ko.observable();

    app.refreshIncident = function (response) {
      var incidentData = JSON.parse(response);
      incidentData.statusSelection = ko.observable(incidentData.status);
      incidentData.prioritySelection = ko.observable(incidentData.priority);
      self.incidentData(incidentData);
    };

    self.handleActivated = function(params) {
      var parentRouter = params.valueAccessor().params['ojRouter']['parentRouter'];
      self.router = parentRouter.createChildRouter('incident').configure(function(stateId) {
        if(stateId) {
          var state = new oj.RouterState(stateId, {
            canEnter: function () {
              return data.getIncident(stateId).then(function(response) {
                var incidentData = JSON.parse(response);
                incidentData.statusSelection = ko.observable(incidentData.status);
                incidentData.prioritySelection = ko.observable(incidentData.priority);
                self.incidentData(incidentData);
                return true;
              }).catch(function(err) {
                console.error('Error loading incidents: ' + JSON.stringify(err));
                return true;
              });
            }
          });
          return state;
        }
      });

      ko.computed(function () {
        // Update moduleConfig only if we have a state.
        // If not when router navigates, this view gets disposed immediately, even before animation is completed.
        // Do this check here rather than in HTML, as that also runs into similar issue and creates jank.
        if (self.router.stateId()) {
          var config = $.extend(true, {}, self.router.moduleConfig, {
            'name': 'incidentViews',
            'cacheKey': 'incidentViews',
          });
          config['params']['locationId'] = self.locationId;
          self.moduleConfig(config);
        }
      });

      return oj.Router.sync();
    };

    self.dispose = function(info) {
      self.router.dispose();
    };

    self.locationId = ko.computed(function() {
      if (self.incidentData()) {
        return self.incidentData().locationId;
      }
    });


    // update incident when status or priority changes
    self.updateIncident = function(id, incident) {
      data.updateIncident(id, incident).then(function(response){
        // update success
      }).fail(function(response) {
        oj.Logger.error('Failed to update incident.', response);
        //app.connectionDrawer.showAfterUpdateMessage();
      });
    };

    // priority selection change
    self.priorityChange = function(event) {
      updatePriorityStatus('priority', event);
    };

    // status selection change
    self.statusChange = function(event) {
      updatePriorityStatus('status', event);
    };

    function updatePriorityStatus(option, event) {
      var value = event.detail.value;
      if(value) {
        var incident = {};
        incident[option] = value;
        self.updateIncident(self.router.stateId(), incident);
      }
    };

  }

  return incidentViewModel;

});
