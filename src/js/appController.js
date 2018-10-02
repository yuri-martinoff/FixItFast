/**
 * @license
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */
/**
 * Copyright (c) 2014, 2018, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 */

// Application level setup including router, animations and other utility methods

'use strict';
define(['ojs/ojcore', 'knockout', 'jquery',
        'dataService',
        'mapping',
        'PushClient',
        'OfflineController',
        'ConnectionDrawer',
        'ojs/ojknockout',
        'ojs/ojnavigationlist',
        'ojs/ojoffcanvas',
        'ojs/ojmodule',
        'ojs/ojrouter',
        'ojs/ojmoduleanimations'],
function (oj, ko, $, data, mapping, PushClient, OfflineController, ConnectionDrawer) {

  oj.Router.defaults['urlAdapter'] = new oj.Router.urlParamAdapter();

  var router = oj.Router.rootInstance;

  // Root router configuration
  router.configure({
    'incidents': { label: 'Incidents' },
    'signin': { label: 'Sign In', isDefault: true },
    'customers': { label: 'Customers' },
    'profile': { label: 'Profile' },
    'about': { label: 'About' },
    'incident': { label: 'Incident' },
    'settings': { label: 'Settings' },
    'createIncident': { label: 'Create an Incident' }
  });

  function AppControllerViewModel() {

    ko.mapping = mapping;

    var self = this;

    // push client
    self.pushClient = new PushClient(self);

    //offline controller
    self.offlineController = new OfflineController(self);

    self.connectionDrawer = new ConnectionDrawer(self);

    self.unreadIncidentsNum = ko.observable();

    self.router = router;

    // drill in and out animation
    var platform = oj.ThemeUtils.getThemeTargetPlatform();

    self.pendingAnimationType = null;

    function switcherCallback(context) {
      return self.pendingAnimationType;
    }

    function mergeConfig(original) {
      return $.extend(true, {}, original, {
        'animation': oj.ModuleAnimations.switcher(switcherCallback),
        'cacheKey': self.router.currentValue()
      });
    }

    self.moduleConfig = mergeConfig(self.router.moduleConfig);

    function positionFixedTopElems(position) {
      var topElems = document.getElementsByClassName('oj-applayout-fixed-top');

      for (var i = 0; i < topElems.length; i++) {
        // Toggle between absolute and fixed positioning so we can animate the header.
        // We don't need to adjust for scrolled content here becaues the animation utility
        // moves the contents to a transitional div losing the scroll position
        topElems[i].style.position = position;
      }
    }

    self.preDrill = function() {
      positionFixedTopElems('absolute');
    };

    self.postDrill = function() {
      positionFixedTopElems('fixed');
      self.pendingAnimationType = null;
    };

    // set default connection to MCS backend
    self.usingMobileBackend = ko.observable();
    self.usingMobileBackend.subscribe(function(newValue) {
      data.setUseMobileBackend(newValue);
    });

    // Assume online mode to start with
    self.usingMobileBackend(true);

    // disable buttons for post/patch/put
    self.isReadOnlyMode = true;

    // Load user profile
    self.userProfileModel = ko.observable();

    self.isDeviceOnline = function() {
      return self.connectionDrawer.isOnline();
    }


    self.subscribeForDeviceOnlineStateChange = function(callback) {
      return self.connectionDrawer.isOnline.subscribe(callback);
    }

     self.getUserProfile = function () {
      return new Promise(function(resolve, reject){
        data.getUserProfile().then(function(response){
          processUserProfile(response, resolve, reject);
        }).catch(function(response){
          oj.Logger.warn('Failed to connect to MCS. Loading from local data.');
          self.isOnlineMode(false);
          //load local profile data
          data.getUserProfile().then(function(response){
            processUserProfile(response, resolve, reject);
          });
        });
      });
    }

    function processUserProfile(response, resolve, reject) {
      var result = JSON.parse(response);

      if (result) {
        self.initialProfile = result;
        self.userProfileModel(ko.mapping.fromJS(result));
        resolve(self.userProfileModel());
        return;
      }

      // This won't happen in general, because then that means the entire offline data loading is broken.
      var message = 'Failed to load user profile both online and offline.';
      oj.Logger.error(message);
      reject(message);
    }

    self.updateProfileData = function() {
      self.initialProfile = ko.mapping.toJS(self.userProfileModel);
      data.updateUserProfile(self.initialProfile).then(function(response){
        // update success
      }).catch(function(response){
        oj.Logger.error(response);
        self.connectionDrawer.showAfterUpdateMessage();
      });
    };

    // Revert changes to user profile
    self.revertProfileData = function() {
      self.userProfileModel(ko.mapping.fromJS(self.initialProfile));
    };

    // initialise spen plugin
    self.spenSupported = ko.observable(false);
    initialise();

    function initialise() {
      if (window.samsung) {
        samsung.spen.isSupported(spenSupported, spenFail);
      }
    }

    function spenSupported() {
      self.spenSupported(true);
    }

    function spenFail(error) {
      oj.Logger.error(error);
    }


    var prevPopupOptions = null;

    self.setupPopup = function(imgSrc) {

      // Define the success function. The popup launches if the success function gets called.
      var success = function(imageURI) {

        if(imageURI.length > 0) {
          // SPen saves image to the same url
          // add query and timestamp for versioning of the cache so it loads the latest
          imageURI = imageURI + '?' + Date.now();
          imgSrc(imageURI);
        }

      }

      // Define the faliure function. An error message displays if there are issues with the popup.
      var failure = function(msg) {
        oj.Logger.error(msg);
      }

      // If there are any previous popups, remove them first before creating a new popup
      if (prevPopupOptions !== null){
        // Call the removeSurfacePopup method from the SPen plugin
        samsung.spen.removeSurfacePopup(prevPopupOptions.id, function() { }, failure);
      }

      var popupOptions = {};
      popupOptions.id = "popupId";

      popupOptions.sPenFlags = 0;

      // strip off suffix from compressed image
      var imageURL;
      if(imgSrc().lastIndexOf('?') > -1) {
        imageURL = imgSrc().slice(0, imgSrc().lastIndexOf('?'));
      } else {
        imageURL = imgSrc();
      }

      popupOptions.imageUri = imageURL;
      popupOptions.imageUriScaleType = samsung.spen.IMAGE_URI_MODE_STRETCH;
      popupOptions.sPenFlags = samsung.spen.FLAG_PEN | samsung.spen.FLAG_ERASER | samsung.spen.FLAG_UNDO_REDO |
                            samsung.spen.FLAG_PEN_SETTINGS;
      popupOptions.returnType = samsung.spen.RETURN_TYPE_IMAGE_URI;

      //Launch the popup
      prevPopupOptions = popupOptions;
      samsung.spen.launchSurfacePopup(popupOptions, success, failure);

    };

    // Navigate to customer by id
    self.goToCustomer = function(id) {
      self.router.go('customers/customerDetails/' + id);
    };

    self.goToCustomerFromIncident = function(id, incidentId) {
      self.fromIncidentId = incidentId;
      self.goToCustomer(id);
    };

    // Navigate to incident by id
    self.goToIncident = function(id, from) {
      self.router.go('incident/' + id);
      self.fromIncidentsTab = from;
    };

    self.goToIncidentFromCustomer = function() {
      // Use the existing value for fromIncidentsTab
      self.goToIncident(self.fromIncidentId, self.fromIncidentsTab);
      self.fromIncidentId = undefined;
    };

    self.goToSignIn = function() {
      self.router.go('signin');
    };

    self.goToIncidents = function() {
      var destination = self.fromIncidentsTab || 'tablist';
      self.router.go('incidents/' + destination);
    };

    self.goToCreateIncident = function() {
      self.fromIncidentsTab = 'tablist';
      self.router.go('createIncident');
    };

    self.drawerChange = function (event) {
      self.closeDrawer();
    };

    self.toggleDrawer = function () {
      return oj.OffcanvasUtils.toggle({selector: '#navDrawer', modality: 'modal', content: '#pageContent' });
    };

    self.closeDrawer = function () {
      return oj.OffcanvasUtils.close({selector: '#navDrawer', modality: 'modal', content: '#pageContent' });
    };

    self.bottomDrawer = { selector: '#bottomDrawer', modality: 'modal', content: '#pageContent', displayMode: 'overlay' };

    self.openBottomDrawer = function(imageObject, saveURI) {

      self.updateProfilePhoto = function(sourceType) {

        var cameraOptions = {
            quality: 50,
            destinationType: saveURI ? Camera.DestinationType.FILE_URI : Camera.DestinationType.DATA_URL,
            sourceType: sourceType,
            encodingType: 0,     // 0=JPG 1=PNG
            correctOrientation: true,
            targetHeight: 2000,
            targetWidth: 2000
        };

        navigator.camera.getPicture(function(imgData) {
          if(saveURI) {
            imageObject(imgData)
          } else {
            imageObject("data:image/jpeg;base64," + imgData);
          }
        }, function(err) {
          oj.Logger.error(err);
        }, cameraOptions);

        return oj.OffcanvasUtils.close(self.bottomDrawer);

      };

      return oj.OffcanvasUtils.open(self.bottomDrawer);
    };

    self.closeBottomDrawer = function() {
      return oj.OffcanvasUtils.close(self.bottomDrawer);
    };

    // upload photo
    self.photoOnChange = function(event) {

      var imgHolder = event.data.imgHolder;

      // Get a reference to the taken picture or chosen file
      var files = event.target.files;
      var file;

      if (files && files.length > 0) {
        file = files[0];
        try {
          var fileReader = new FileReader();
          fileReader.onload = function (event) {
            imgHolder(event.target.result);
          };
          fileReader.readAsDataURL(file);
        } catch (e) {
          oj.Logger.error(e);
        }
      }
    };

    // Common utility functions for formatting
    var avatarColorPalette = ["#42ad75", "#17ace4", "#e85d88", "#f4aa46", "#5a68ad", "#2db3ac", "#c6d553", "#eb6d3a"];

    var userAvatarColor = "#eb6d3a";

    var formatAvatarColor = function (role, id) {
      if(role.toLowerCase() === 'customer') {
        return avatarColorPalette[id.slice(-3)%8];
      } else {
        return userAvatarColor;
      }
    };

    var formatInitials = function(firstName, lastName) {
      if(firstName && lastName) {
        return firstName.charAt(0).toUpperCase() + lastName.charAt(0).toUpperCase();
      }
    };

    var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    var formatTimeStamp = function(timeString) {

      var timeStamp = Date.parse(timeString);
      var date = new Date(timeStamp);
      var hours = date.getHours();
      var minutes = "0" + date.getMinutes();
      var formattedTime = hours + ':' + minutes.substr(-2);

      var monthName = monthNames[date.getMonth()].substr(0, 3);
      var dateString = "0" + date.getDate();
      var formattedDate = monthName + ' ' + dateString.substr(-2);

      return {
        time: formattedTime,
        date: formattedDate
      };
    };

    // automatically adjust content padding when top fixed region changes
    var adjustContentPadding = function() {
      var topElem = document.getElementsByClassName('oj-applayout-fixed-top')[0];
      var contentElems = document.getElementsByClassName('oj-applayout-content');
      var bottomElem = document.getElementsByClassName('oj-applayout-fixed-bottom')[0];

      for(var i=0; i<contentElems.length; i++) {
      if (topElem) {
        contentElems[i].style.paddingTop = topElem.offsetHeight+'px';
      }

      if (bottomElem) {
        contentElems[i].style.paddingBottom = bottomElem.offsetHeight+'px';
      }
      // Add oj-complete marker class to signal that the content area can be unhidden.
      contentElems[i].classList.add('oj-complete');
      }

    };

    self.appUtilities = {
      formatAvatarColor: formatAvatarColor,
      formatInitials: formatInitials,
      formatTimeStamp: formatTimeStamp,
      adjustContentPadding: adjustContentPadding
    };
  }

  return new AppControllerViewModel();

});
