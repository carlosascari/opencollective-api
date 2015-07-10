/**
 * Dependencies.
 */
var _ = require('lodash');
var app = require('../index');
var async = require('async');
var config = require('config');
var expect = require('chai').expect;
var request = require('supertest');
var utils = require('../test/utils.js')();
var sinon = require('sinon');
var nock = require('nock');

/**
 * Variables.
 */
var models = app.set('models');
var paypalMock = require('./mocks/paypal');

/**
 * Tests.
 */
describe.only('paypal.preapproval.routes.test.js', function() {

  var application;
  var user;
  var user2;

  var stub;

  beforeEach(function() {
    var stub = sinon.stub(app.paypalAdaptive, 'preapproval');
    stub.yields(null, paypalMock.adaptive.preapproval);
  });

  afterEach(function() {
    app.paypalAdaptive.preapproval.restore();
  });

  beforeEach(function(done) {
    async.auto({
      cleanAndCreateApplication: function(cb) {
        utils.cleanAllDb(cb);
      },
      createUserA: ['cleanAndCreateApplication', function(cb) {
        models.User.create(utils.data('user1')).done(cb);
      }],
      createUserB: ['cleanAndCreateApplication', function(cb) {
        models.User.create(utils.data('user2')).done(cb);
      }]
    }, function(e, results) {
      expect(e).to.not.exist;
      application = results.cleanAndCreateApplication;
      user = results.createUserA;
      user2 = results.createUserB;
      done();
    });
  });

  /**
   * Get the preapproval Key.
   */
  describe('#getPreapprovalKey', function() {

    it('should fail if not the logged-in user', function(done) {
      request(app)
        .get('/users/' + user.id + '/paypal/preapproval')
        .set('Authorization', 'Bearer ' + user2.jwt(application))
        .expect(403)
        .end(done);
    });

    it('should get a preapproval key', function(done) {
      request(app)
        .get('/users/' + user.id + '/paypal/preapproval')
        .set('Authorization', 'Bearer ' + user.jwt(application))
        .expect(200)
        .end(function(e, res) {
          expect(e).to.not.exist;
          expect(res.body).to.have.property('preapprovalKey', paypalMock.adaptive.preapproval.preapprovalKey);

          models.Card
            .findAndCountAll({})
            .then(function(res) {
              expect(res.count).to.equal(1);
              var paykey = res.rows[0];
              expect(paykey).to.have.property('service', 'paypal');
              expect(paykey).to.have.property('UserId', user.id);
              expect(paykey).to.have.property('token', paypalMock.adaptive.preapproval.preapprovalKey);
              done();
            })
            .catch(done);
        });
    });

    describe('Check existing cards', function() {

      it('should delete if the date is past');
      it('should delete if not approved yet');

    });

  });

  /**
   * Confirm a preapproval.
   */
  describe('#confirmPreapproval', function() {

    var preapprovalkey = paypalMock.adaptive.preapproval.preapprovalKey;

    beforeEach(function(done) {
      request(app)
        .get('/users/' + user.id + '/paypal/preapproval')
        .set('Authorization', 'Bearer ' + user.jwt(application))
        .expect(200)
        .end(done);
    });

    describe('Details from Paypal COMPLETED', function() {

      beforeEach(function() {
        var stub = sinon.stub(app.paypalAdaptive, 'preapprovalDetails');
        stub.yields(null, paypalMock.adaptive.preapprovalDetails.completed);
      });

      afterEach(function() {
        app.paypalAdaptive.preapprovalDetails.restore();
      });

      it('should fail if not the logged-in user', function(done) {
        request(app)
          .post('/users/' + user.id + '/paypal/preapproval/' + preapprovalkey)
          .set('Authorization', 'Bearer ' + user2.jwt(application))
          .expect(403)
          .end(done);
      });

      it('should fail with an unknown paykey', function(done) {
        request(app)
          .post('/users/' + user.id + '/paypal/preapproval/' + 'abc')
          .set('Authorization', 'Bearer ' + user.jwt(application))
          .expect(404)
          .end(done);
      });

      it('should confirm the payment of a transaction', function(done) {
        request(app)
          .post('/users/' + user.id + '/paypal/preapproval/' + preapprovalkey)
          .set('Authorization', 'Bearer ' + user.jwt(application))
          .expect(200)
          .end(function(e, res) {
            expect(e).to.not.exist;
            expect(res.body.token).to.equal(preapprovalkey);

            async.auto({
              checkCard: function(cb) {
                models.Card.findAndCountAll({where: {token: preapprovalkey} }).then(function(res) {
                  expect(res.count).to.equal(1);
                  expect(res.rows[0].confirmedAt).not.to.be.null;
                  expect(res.rows[0].service).to.equal('paypal');
                  expect(res.rows[0].UserId).to.equal(user.id);
                  cb();
                });
              },
              checkActivity: function(cb) {
                models.Activity.findAndCountAll({where: {type: 'user.card.created'} }).then(function(res) {
                  expect(res.count).to.equal(1);
                  cb();
                });
              }
            }, done);

          });
      });

    });

    describe('Details from Paypal CREATED', function() {

      beforeEach(function() {
        var stub = sinon.stub(app.paypalAdaptive, 'paymentDetails');
        stub.yields(null, paypalMock.adaptive.paymentDetails.created);
      });

      afterEach(function() {
        app.paypalAdaptive.paymentDetails.restore();
      });

      it('should return an error if the preapproval is not completed');

    });

    describe('Details from Paypal ERROR', function() {

      beforeEach(function() {
        var stub = sinon.stub(app.paypalAdaptive, 'paymentDetails');
        stub.yields(null, paypalMock.adaptive.paymentDetails.error);
      });

      afterEach(function() {
        app.paypalAdaptive.paymentDetails.restore();
      });

      it('should return an error if paypal returns one');

    });

    describe('Cards clean up', function() {

      it('should delete all other cards entries in the database to clean up');

    });

  });

});