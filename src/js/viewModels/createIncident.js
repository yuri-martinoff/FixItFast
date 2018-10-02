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
define(['ojs/ojcore', 'knockout', 'jquery',
        'mapping',
        'dataService',
        'appController',
        'ojs/ojknockout',
        'ojs/ojtrain',
        'ojs/ojarraytabledatasource',
        'ojs/ojinputtext'],
function(oj, ko, $, mapping, data, app) {
  function createIncidentViewModel(params) {
    var self = this;

    self.handleActivated = function(params) {

      var parentRouter = params.valueAccessor().params['ojRouter']['parentRouter'];

      self.router = parentRouter.createChildRouter('createIncident').configure({
        'createIncident_problem': { label: 'Problem', isDefault: true, value: {prev:'Cancel', next: 'Next', showTrain: true} },
        'createIncident_photo': { label: 'Photo', value: {prev:'Previous', next: 'Next', showTrain: true, img: self.newIncidentModel().picture } },
        'createIncident_contact': { label: 'Contact', value: {prev:'Previous', next: 'Next', showTrain: true } },
        'createIncident_summary': { label: 'Summary', value: {prev:'Previous', next: 'Submit', showTrain: true } },
        'createIncident_submit': { label: 'Submit', value: {prev:'', next: '', showTrain: false } }
      });

      return oj.Router.sync();
    };

    self.handleTransitionCompleted = function(info) {
      // adjust content padding top
      var train = document.getElementById('train');
      oj.Context.getContext(train).getBusyContext().whenReady().then(function () {
          app.appUtilities.adjustContentPadding();
      });
    };

    // dispose create incident page child router
    self.dispose = function(info) {
      self.router.dispose();
    };

    self.stepArray = ko.observableArray([{label:'Problem', id:'createIncident_problem'},
                                         {label:'Photo', id:'createIncident_photo'},
                                         {label:'Customer', id:'createIncident_contact'},
                                         {label:'Summary', id:'createIncident_summary'}]);

    ko.mapping = mapping;

    var newIncidentObj = {
      "problem": "",
      "category": "general",
      "picture": "",
      "priority": "high",
      "customerId": "",
      "locationId": "",
      "customerName": ""
    };

    self.newIncidentModel = ko.observable(ko.mapping.fromJS(newIncidentObj));

    self.allCustomers = ko.observableArray();
    self.customersDataSource = new oj.ArrayTableDataSource(self.allCustomers, {idAttribute: "id"});

    // load customers data
    data.getCustomers().then(function(response) {

      var result = JSON.parse(response).result;

      // sort by firstName then lastName within each group
      result.sort(function(a, b) {
        // sort by first name
        if (a.firstName.toLowerCase() > b.firstName.toLowerCase()) {
          return 1;
        } else if (a.firstName.toLowerCase() < b.firstName.toLowerCase()) {
          return -1;
        }

        // else sort by last name
        return (a.lastName.toLowerCase() > b.lastName.toLowerCase()) ? 1 : (a.lastName.toLowerCase() < b.lastName.toLowerCase()) ? -1 : 0;
      });


      self.allCustomers(result);
      self.customersDataSource = new oj.ArrayTableDataSource(self.allCustomers, {idAttribute: "id"});

    });

    // handler when customer selection changes
    self.customerSelectionChange = function(event) {
      var value = event.detail.value;
      if(value) {

        var selectedCustomer = self.allCustomers().filter(function(customer) {
          return customer.id === value;
        });

        self.newIncidentModel().customerName(selectedCustomer[0].firstName + ' ' + selectedCustomer[0].lastName);
        self.newIncidentModel().locationId(selectedCustomer[0].locationId);
      }
    };

    // Validate required fields
    self._validateRequiredFields = function (pageId) {
      var incident = ko.mapping.toJS(self.newIncidentModel);
      if (pageId == "createIncident_problem") {
        if (!incident.problem) {
          // Custom Error Message
          document.getElementById('problem-input').messagesCustom = [new oj.Message('Required.', 'Please describe the problem.')];
          return false;
        }
        else if (!document.getElementById("categoryRadioSet").validate())
          return false;
        else if (!document.getElementById("priorityRadioSet").validate())
          return false;
      }
      else if (pageId == "createIncident_contact") {
        if (!incident.customerId) {
          // Custom Error Message
          document.getElementById("customerSelectionRadioSet").messagesCustom = [new oj.Message('Required.', 'Please select a customer.')];
          return false;
        }
      }
      return true;
    }

    // go to next step
    self.nextStep = function() {
      var train = document.getElementById('train');
      var next = train.getNextSelectableStep();
      if(next !== null) {
        if (self._validateRequiredFields(train.selectedStep))
          self.router.go(next);
      } else {
        self._submitIncident();
      }
    };

    // go to previous step
    self.previousStep = function() {
      var train = document.getElementById('train');
      var prev = train.getPreviousSelectableStep();
      if(prev !== null) {
        self.router.go(prev);
      } else {
        app.goToIncidents();
      }
    };

    self.trainBeforeSelect = function (event) {
      if (!self._validateRequiredFields(event.detail.fromStep.id))
        event.preventDefault();
    }

    function failedToCreateIncident(err) {
      oj.Logger.error('Failed to create incident.', err);
    }

    function loadImageUsingCanvas(localUrl) {
      return new Promise(function(resolve, reject) {
        var $img = $('<img/>');
        $img.attr('src', localUrl);
        $img.css({position: 'absolute', left: '0px', top: '-999999em', maxWidth: 'none', width: 'auto', height: 'auto'});
        $img.bind('load', function() {
          var canvas = document.createElement("canvas");
          canvas.width = $img[0].width;
          canvas.height = $img[0].height;
          var ctx = canvas.getContext('2d');
          ctx.drawImage($img[0], 0, 0);
          resolve(canvas.toDataURL('image/jpeg'));
        });
      });
    }

    function loadImageUsingFilePlugin(localUrl) {
      return new Promise(function(resolve, reject) {
        window.resolveLocalFileSystemURL(localUrl, function(fileEntry) {
          fileEntry.file(function (file) {
            var reader = new FileReader();
            reader.onloadend = function(evt) {
              resolve(evt.target.result);
            };
            reader.readAsDataURL(file);
          });
        });
      });
    }

    // submit new incident
    self._submitIncident = function() {

      var incident = ko.mapping.toJS(self.newIncidentModel);

      delete incident.customerName;
      incident.customerId = incident.customerId;

      // TODO validation
      if(!incident.problem) {
        app.router.go("createIncident");
        return oj.Logger.warn('Please enter the problem');
      }

      if(!incident.customerId) {
        app.router.go("createIncident/createIncident_contact");
        return oj.Logger.warn('Please select a customer');
      }

      // if image is in url, convert to base64
      if(incident.picture.indexOf('file:///') > -1 || incident.picture.indexOf('content://') > -1) {
        var imageLoadingPromise;
        if (cordova.file) {
          imageLoadingPromise = loadImageUsingFilePlugin(incident.picture);
        } else {
          imageLoadingPromise = loadImageUsingCanvas(incident.picture);
        }

        imageLoadingPromise
          .then(function(imgData) {
            incident.picture = imgData;
            // submit incident
            self.router.go('createIncident_submit');
            data.createIncident(incident).then(function(response){
              // go back to incidents list after 1.5s
              setTimeout(function() {
                app.goToIncidents();
              }, 1500);
            }).fail(failedToCreateIncident);
          })
          .catch(failedToCreateIncident);
      } else {
        self.router.go('createIncident_submit');
        data.createIncident(incident).then(function(response){
          // go back to incidents list after 1.5s
          setTimeout(function() {
            app.goToIncidents();
          }, 1500);
        }).fail(function(response){
          app.goToIncidents();
          oj.Logger.error('Failed to create incident.', response);
        });

      }

    };

    // create incident page header
    self.createIncidentHeaderSettings = function() {

      var clickAction = function() {
        if(self.router.currentValue())
          if(self.router.currentValue().showTrain) {
            return self.previousStep();
          } else {
            return app.toggleDrawer();
          }
      };

      var icons = ko.computed(function() {
        if(self.router.currentValue())
          if(self.router.currentValue().showTrain) {
            return 'oj-hybrid-applayout-header-icon-back demo-icon oj-fwk-icon';
          } else {
            return 'oj-fwk-icon oj-fwk-icon-hamburger';
          }
        else
          return 'oj-fwk-icon oj-fwk-icon-hamburger';

      });

      var disableSubmit = ko.computed(function() {
        if(self.router.stateId() === 'createIncident_summary' && app.isReadOnlyMode)
          return true;
        else
          return false;
      })

      return {
        name:'basicHeader',
        params: {
          title: 'New Incident',
          startBtn: {
            id: 'backBtn',
            click: clickAction,
            display: 'icons',
            label: self.router.currentValue() ? self.router.currentValue().prev : '',
            icons: icons,
            visible: true
          },
          endBtn: {
            id: 'nextBtn',
            click: self.nextStep,
            display: 'icons',
            label: self.router.currentValue() ? self.router.currentValue().next : '',
            icons: 'oj-fwk-icon oj-fwk-icon-next',
            visible: self.router.currentValue() ? self.router.currentValue().showTrain : false,
            disabled: disableSubmit
          }
        }
      };
    };
  }

  return createIncidentViewModel;

});
