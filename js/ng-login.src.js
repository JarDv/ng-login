'use strict';

/**
 * Contains functions that are added to the root AngularJs scope.
 */
angular.module('loginApp').run(function($rootScope, $state, Auth, AUTH_EVENTS) {
  
  //before each state change, check if the user is logged in
  //and authorized to move onto the next state
  $rootScope.$on('$stateChangeStart', function (event, next) {
      var authorizedRoles = next.data.authorizedRoles;
      if (!Auth.isAuthorized(authorizedRoles)) {
        event.preventDefault();
        if (Auth.isAuthenticated()) {
          // user is not allowed
          $rootScope.$broadcast(AUTH_EVENTS.notAuthorized);
        } else {
          // user is not logged in
          $rootScope.$broadcast(AUTH_EVENTS.notAuthenticated);
        }
      }
    });
  
  /* To show current active state on menu */
  $rootScope.getClass = function(path) {
    if ($state.current.name == path) {
      return "active";
    } else {
      return "";
    }
  }
  
  $rootScope.logout = function(){
    Auth.logout();
  };

});


/**
 * This interceptor will make sure that, after each $http request
 * if the user doesn't have access to something runs the according
 * event, given the response status codes from the server. 
 */
angular.module('loginApp')
.factory('AuthInterceptor', [ '$rootScope', '$q', 'Session', 'AUTH_EVENTS',
function($rootScope, $q, Session, AUTH_EVENTS) {
  return {
    responseError : function(response) {
      $rootScope.$broadcast({
        401 : AUTH_EVENTS.notAuthenticated,
        403 : AUTH_EVENTS.notAuthorized,
        419 : AUTH_EVENTS.sessionTimeout,
        440 : AUTH_EVENTS.sessionTimeout
      }[response.status], response);
      return $q.reject(response);
    }
  };
} ]);


angular.module('loginApp').
controller('ParentController', ['$scope', '$rootScope', '$modal', 'Auth', 'AUTH_EVENTS','USER_ROLES',
function($scope, $rootScope, $modal, Auth, AUTH_EVENTS, USER_ROLES){
  // this is the parent controller for all controllers.
  // Manages auth login functions and each controller
  // inherits from this controller  

  
  $scope.modalShown = false;
  var showLoginDialog = function() {
    if(!$scope.modalShown){
      $scope.modalShown = true;
      var modalInstance = $modal.open({
        templateUrl : 'templates/login.html',
        controller : "LoginCtrl",
        backdrop : 'static',
      });

      modalInstance.result.then(function() {
        $scope.modalShown = false;
      });
    }
  };
  
  var setCurrentUser = function(){
    $scope.currentUser = $rootScope.currentUser;
  }
  
  var showNotAuthorized = function(){
    alert("Not Authorized");
  }
  
  $scope.currentUser = null;
  $scope.userRoles = USER_ROLES;
  $scope.isAuthorized = Auth.isAuthorized;

  //listen to events of unsuccessful logins, to run the login dialog
  $rootScope.$on(AUTH_EVENTS.notAuthorized, showNotAuthorized);
  $rootScope.$on(AUTH_EVENTS.notAuthenticated, showLoginDialog);
  $rootScope.$on(AUTH_EVENTS.sessionTimeout, showLoginDialog);
  $rootScope.$on(AUTH_EVENTS.logoutSuccess, showLoginDialog);
  $rootScope.$on(AUTH_EVENTS.loginSuccess, setCurrentUser);
  
} ]);


angular.module('loginApp')
.controller('LoginCtrl', [ '$scope', '$state', '$modalInstance' , '$window', 'Auth', 
function($scope, $state, $modalInstance, $window, Auth ) {
  $scope.credentials = {};
  $scope.loginForm = {};
  $scope.error = false;
  
  //when the form is submitted
  $scope.submit = function() {
    $scope.submitted = true;
    if (!$scope.loginForm.$invalid) {
      $scope.login($scope.credentials);
    } else {
      $scope.error = true;
      return;
    }
  };

  //Performs the login function, by sending a request to the server with the Auth service
  $scope.login = function(credentials) {
    $scope.error = false;
    Auth.login(credentials, function(user) {
      //success function
      $modalInstance.close();
      $state.go('home');
    }, function(err) {
      console.log("error");
      $scope.error = true;
    });
  };
  
  // if a session exists for current user (page was refreshed)
  // log him in again
  if ($window.sessionStorage["userInfo"]) {
    var credentials = JSON.parse($window.sessionStorage["userInfo"]);
    $scope.login(credentials);
  }

} ]);


angular.module('loginApp')
.factory('Auth', [ '$http', '$rootScope', '$window', 'Session', 'AUTH_EVENTS', 
function($http, $rootScope, $window, Session, AUTH_EVENTS) {
  var authService = {};
  
  
  //the login function
  authService.login = function(user, success, error) {
    $http.post('misc/users.json').success(function(data) {
    
    //this is my dummy technique, normally here the 
    //user is returned with his data from the db
    var users = data.users;
    if(users[user.username]){
      var loginData = users[user.username];
      //insert your custom login function here 
      if(user.username == loginData.username && user.password == loginData.username){
        //set the browser session, to avoid relogin on refresh
        $window.sessionStorage["userInfo"] = JSON.stringify(loginData);
        
        //delete password not to be seen clientside 
        delete loginData.password;
        
        //update current user into the Session service or $rootScope.currentUser
        //whatever you prefer
        Session.create(loginData);
        //or
        $rootScope.currentUser = loginData;
        
        //fire event of successful login
        $rootScope.$broadcast(AUTH_EVENTS.loginSuccess);
        //run success function
        success(loginData);
      } else{
        //OR ELSE
        //unsuccessful login, fire login failed event for 
        //the according functions to run
        $rootScope.$broadcast(AUTH_EVENTS.loginFailed);
        error();
      }
    } 
    });
    
  };

  //check if the user is authenticated
  authService.isAuthenticated = function() {
    return !!Session.user;
  };
  
  //check if the user is authorized to access the next route
  //this function can be also used on element level
  //e.g. <p ng-if="isAuthorized(authorizedRoles)">show this only to admins</p>
  authService.isAuthorized = function(authorizedRoles) {
    if (!angular.isArray(authorizedRoles)) {
        authorizedRoles = [authorizedRoles];
      }
      return (authService.isAuthenticated() &&
        authorizedRoles.indexOf(Session.userRole) !== -1);
  };
  
  //log out the user and broadcast the logoutSuccess event
  authService.logout = function(){
    Session.destroy();
    $window.sessionStorage.removeItem("userInfo");
    $rootScope.$broadcast(AUTH_EVENTS.logoutSuccess);
  }

  return authService;
} ]);


/*
 * In this service the user data is defined for the current session. Within
 * angular current session is until the page is refreshed. When the page is
 * refreshed the user is reinitialized through $window.sessionStorage at the
 * login.js file.
 */
angular.module('loginApp').service('Session', function($rootScope, USER_ROLES) {

  this.create = function(user) {
    this.user = user;
    this.userRole = user.userRole;
  };
  this.destroy = function() {
    this.user = null;
    this.userRole = null;
  };
  return this;
});