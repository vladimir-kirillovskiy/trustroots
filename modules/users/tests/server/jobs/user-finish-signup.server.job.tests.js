'use strict';

/**
 * Module dependencies.
 */
var _ = require('lodash'),
    path = require('path'),
    should = require('should'),
    testutils = require(path.resolve('./testutils')),
    config = require(path.resolve('./config/config')),
    moment = require('moment'),
    mongoose = require('mongoose'),
    User = mongoose.model('User');

/**
 * Globals
 */
var unConfirmedUser,
    _unConfirmedUser,
    confirmedUser,
    _confirmedUser,
    userFinishSignupJobHandler;

describe('Job: user finish signup', function() {

  var jobs = testutils.catchJobs();

  before(function() {
    userFinishSignupJobHandler = require(path.resolve('./modules/users/server/jobs/user-finish-signup.server.job'));
  });

  // Create an unconfirmed user
  beforeEach(function (done) {

    // Create a new user
    _unConfirmedUser = {
      public: false,
      firstName: 'Full',
      lastName: 'Name',
      displayName: 'Full Name',
      email: 'test@test.com',
      emailTemporary: 'test@test.com', // unconfirmed users have this set
      emailToken: 'initial email token',
      username: 'user_unconfirmed',
      displayUsername: 'user_unconfirmed',
      password: 'M3@n.jsI$Aw3$0m3',
      provider: 'local',
      created: moment().subtract(moment.duration({ 'hours': 4 }))
    };

    unConfirmedUser = new User(_unConfirmedUser);

    // Save a user to the test db
    unConfirmedUser.save(done);
  });

  // Create a confirmed user
  beforeEach(function (done) {

    _confirmedUser = {
      public: true,
      firstName: 'Full',
      lastName: 'Name',
      displayName: 'Full Name',
      email: 'confirmed-test@test.com',
      username: 'user_confirmed',
      displayUsername: 'user_confirmed',
      password: 'M3@n.jsI$Aw3$0m4',
      provider: 'local',
      created: moment().subtract(moment.duration({ 'hours': 4 }))
    };

    confirmedUser = new User(_confirmedUser);

    // Save a user to the test db
    confirmedUser.save(done);
  });

  it('Do not remind unconfirmed users <4 hours after their signup', function(done) {
    unConfirmedUser.created = moment().subtract(moment.duration({ 'hours': 3 }));
    unConfirmedUser.save(function(err) {
      if (err) return done(err);

      userFinishSignupJobHandler({}, function(err) {
        if (err) return done(err);
        jobs.length.should.equal(0);
        done();
      });

    });
  });

  it('Remind unconfirmed users >4 hours after their signup', function(done) {
    userFinishSignupJobHandler({}, function(err) {
      if (err) return done(err);

      jobs.length.should.equal(1);
      jobs[0].type.should.equal('send email');
      jobs[0].data.subject.should.equal('Complete your signup to Trustroots');
      jobs[0].data.to.address.should.equal(_unConfirmedUser.email);

      User.findOne({ email: _unConfirmedUser.email }, function(err, user) {
        if (err) return done(err);
        user.publicReminderCount.should.equal(1);
        should.exist(user.publicReminderSent);
        done();
      });

    });
  });

  it('Remind unconfirmed users 2nd time >2 days after previous notification', function(done) {
    unConfirmedUser.publicReminderCount = 1;
    unConfirmedUser.publicReminderSent = moment().subtract(moment.duration({ 'days': 2 }));
    unConfirmedUser.save(function(err) {
      if (err) return done(err);
      userFinishSignupJobHandler({}, function(err) {
        if (err) return done(err);

        jobs.length.should.equal(1);
        jobs[0].type.should.equal('send email');
        jobs[0].data.subject.should.equal('Complete your signup to Trustroots');
        jobs[0].data.to.address.should.equal(_unConfirmedUser.email);

        User.findOne({ email: _unConfirmedUser.email }, function(err, user) {
          if (err) return done(err);
          user.publicReminderCount.should.equal(2);
          should.exist(user.publicReminderSent);
          done();
        });

      });
    });
  });

  it('Remind unconfirmed users 3rd time >2 days after previous notification', function(done) {
    unConfirmedUser.publicReminderCount = 2;
    unConfirmedUser.publicReminderSent = moment().subtract(moment.duration({ 'days': 2 }));
    unConfirmedUser.save(function(err) {
      if (err) return done(err);
      userFinishSignupJobHandler({}, function(err) {
        if (err) return done(err);

        jobs.length.should.equal(1);
        jobs[0].type.should.equal('send email');
        jobs[0].data.subject.should.equal('Complete your signup to Trustroots');
        jobs[0].data.to.address.should.equal(_unConfirmedUser.email);

        User.findOne({ email: _unConfirmedUser.email }, function(err, user) {
          if (err) return done(err);
          user.publicReminderCount.should.equal(3);
          should.exist(user.publicReminderSent);
          done();
        });

      });
    });
  });

  it('Do not remind unconfirmed users 4rd time >2 days after previous notification', function(done) {
    unConfirmedUser.publicReminderCount = 3;
    unConfirmedUser.publicReminderSent = moment().subtract(moment.duration({ 'days': 2 }));
    unConfirmedUser.save(function(err) {
      if (err) return done(err);
      userFinishSignupJobHandler({}, function(err) {
        if (err) return done(err);
        jobs.length.should.equal(0);
        User.findOne({ email: _unConfirmedUser.email }, function(err, user) {
          if (err) return done(err);
          user.publicReminderCount.should.equal(3);
          should.exist(user.publicReminderSent);
          done();
        });
      });
    });
  });

  it('Remind multiple unconfirmed users >4 hours after their signup, but no more than maximum amount of notifications at once', function(done) {

    // Create test users
    var _users = [];
    for (var i = 1; i <= config.limits.maxProcessSignupReminders + 1; i++) {
      var loopVars = {
        username: 'l' + i + _unConfirmedUser.username,
        displayUsername: 'l' + i + _unConfirmedUser.displayUsername,
        emailToken: 'l' + i + _unConfirmedUser.emailToken,
        emailTemporary: 'l' + i + _unConfirmedUser.emailTemporary,
        email: 'l' + i + _unConfirmedUser.email
      };
      var _unConfirmedUserLooped = _.merge(_.clone(_unConfirmedUser), loopVars);
      _users.push(_unConfirmedUserLooped);
    }

    // Save all users to the test db
    User.insertMany(_users, function(err) {
      if (err) return done(err);

      userFinishSignupJobHandler({}, function(err) {
        if (err) return done(err);

        jobs.length.should.equal(config.limits.maxProcessSignupReminders);
        done();
      });
    });
  });

  afterEach(function (done) {
    User.remove().exec(done);
  });
});