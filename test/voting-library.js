/* eslint-env node, mocha */
// These globals are added by Truffle:
/* globals contract, RootColony, Colony, EternalStorage, assert, web3*/
var testHelper = require('../helpers/test-helper.js');
import { solSha3 } from 'colony-utils';

contract('VotingLibrary', function (accounts) {
  var _COLONY_KEY_;
  var _MAIN_ACCOUNT_ = accounts[0];
  var _OTHER_ACCOUNT_ = accounts[1];
  var rootColony;
  var colony;
  var eternalStorage;
  var eternalStorageRoot;

  var _POLL_ID_1_ = 1;
  var _POLL_ID_2_ = 2;
  var _POLL_ID_3_ = 3;
  var _POLL_ID_4_ = 4;

  var _VOTE_SECRET_1_;
  var _VOTE_SECRET_2_;
  var _VOTE_SECRET_3_;
  var _VOTE_SECRET_4_;

  var createAndOpenSimplePoll = async function(description, duration){
    var tx;
    tx = await colony.createPoll(description);
    console.log('createPoll tx id ', tx);
    var pollCount = await eternalStorage.getUIntValue.call(solSha3('PollCount'));
    tx = await colony.addPollOption(pollCount.toNumber(), 'Yes');
    console.log('addPollOption tx id ', tx);
    tx = await colony.addPollOption(pollCount.toNumber(), 'No');
    console.log('addPollOption tx id ', tx);
    tx = await colony.openPoll(pollCount.toNumber(), duration);
    console.log('openPoll tx id ', tx);
  };

  before(async function (done) {
    rootColony = RootColony.deployed();
    eternalStorageRoot = EternalStorage.deployed();
    done();
  });

  beforeEach(function (done) {
    _VOTE_SECRET_1_ = solSha3(testHelper.getRandomString(5));
    _VOTE_SECRET_2_ = solSha3(testHelper.getRandomString(5));
    _VOTE_SECRET_3_ = solSha3(testHelper.getRandomString(5));
    _VOTE_SECRET_4_ = solSha3(testHelper.getRandomString(5));

    _COLONY_KEY_ = testHelper.getRandomString(7);

    eternalStorageRoot.owner.call()
      .then(function () {
        rootColony.createColony(_COLONY_KEY_, { from: _MAIN_ACCOUNT_ });
        testHelper.mineTransaction();
      })
      .then(function () {
        return rootColony.getColony.call(_COLONY_KEY_);
      })
      .then(function (colony_) {
        colony = Colony.at(colony_);
        return;
      })
      .then(function () {
        return colony.eternalStorage.call();
      })
      .then(function (extStorageAddress) {
        eternalStorage = EternalStorage.at(extStorageAddress);
        return;
      })
      .then(done)
      .catch(done);
  });

  // Mine all transations at the end of each test
  afterEach(function (done) {
    testHelper.mineTransaction();
    done();
  });

  describe('when creating a poll', function(){
    it('it should be added correctly', async function(done){
      try{
        await colony.createPoll('simple yes/no vote');
        //Check it's been inserted correctly
        var pollDescription = await eternalStorage.getStringValue.call(solSha3('Poll', 1, 'description'));
        assert.equal(pollDescription, 'simple yes/no vote');

        var pollStatus = await eternalStorage.getUIntValue.call(solSha3('Poll', 1, 'status'));
        assert.equal(0, pollStatus.toNumber());

        var pollOptionsCount = await eternalStorage.getUIntValue.call(solSha3('Poll', 1, 'OptionsCount'));
        assert.equal(0, pollOptionsCount.toNumber());

        var pollCount = await eternalStorage.getUIntValue.call(solSha3('PollCount'));
        assert.equal(pollCount.toNumber(), 1);
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('should update the poll count correctly', async function(done){
      try{
        await colony.createPoll(24, 'poll 1');
        await colony.createPoll(48, 'poll 2');
        await colony.createPoll(12, 'poll 3');
        await colony.createPoll(240, 'poll 4');
        await colony.createPoll(120, 'poll 5');
        await colony.createPoll(20, 'poll 6');

        var pollCount = await eternalStorage.getUIntValue.call(solSha3('PollCount'));
        assert.equal(pollCount.toNumber(), 6);

        done();
      } catch (err) {
        return done(err);
      }
    });
  });

  describe('when adding poll options to a poll', function(){
    it('they should be added correctly', async function(done){
      try {
        await colony.createPoll('simple yes/no vote');
        await colony.addPollOption(1, 'Yes');
        await colony.addPollOption(1, 'No');

        var pollOption1 = await eternalStorage.getStringValue.call(solSha3('Poll', 1, 'option', 1));
        var pollOption2 = await eternalStorage.getStringValue.call(solSha3('Poll', 1, 'option', 2));
        assert.equal(pollOption1, 'Yes');
        assert.equal(pollOption2, 'No');

        var pollOptionsCount = await eternalStorage.getUIntValue.call(solSha3('Poll', 1, 'OptionsCount'));
        assert.equal(pollOptionsCount.toNumber(), 2);
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('and more than the allowed 4 are added, should fail', async function(done){
      try{
        await colony.createPoll('simple yes/no vote');
        await colony.addPollOption(1, 'Yes');
        await colony.addPollOption(1, 'No');
        await colony.addPollOption(1, 'Maybe');
        await colony.addPollOption(1, 'Definitely maybe');
        // Should fail here
        var result = await colony.addPollOption.call(1, 'Maybe not');
        assert.isFalse(result);

        await colony.addPollOption(1, 'Maybe not');

        var pollOptionsCount = await eternalStorage.getUIntValue.call(solSha3('Poll', 1, 'OptionsCount'));
        assert.equal(pollOptionsCount.toNumber(), 4);
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('and poll is open, should fail', async function(done){
        await colony.createPoll('simple yes/no vote');
        await colony.addPollOption(1, 'Yes');
        await colony.addPollOption(1, 'No');
        await colony.openPoll(1, 24);

        // Should fail here
        colony.addPollOption(1, 'Maybe')
        .catch(testHelper.ifUsingTestRPC)
        .then(done)
        .catch(done);
    });
  });

  describe('when opening a poll', function(){
    it('should set the correct poll start and close times', async function(done){
      try{
        await createAndOpenSimplePoll('poll 1',24);
        var pollStartTime = await eternalStorage.getUIntValue.call(solSha3('Poll', 1, 'startTime'));
        var pollCloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', 1, 'closeTime'));
        var lastBlock = await web3.eth.getBlock('latest');
        assert.equal(pollStartTime.toNumber(), lastBlock.timestamp);
        assert.equal(pollCloseTime.toNumber(), lastBlock.timestamp + 24 * 3600);
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('should update the status to \'open\'', async function(done){
      try{
        await createAndOpenSimplePoll('poll 1',24);
        var pollStatus = await eternalStorage.getUIntValue.call(solSha3('Poll', 1, 'status'));
        assert.equal(1, pollStatus.toNumber());
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('with less than 2 available vote options, should fail', async function(done){
      await colony.createPoll('poll 1');
      colony.openPoll(1, 24).catch(testHelper.ifUsingTestRPC);
      var pollCount = await eternalStorage.getUIntValue.call(solSha3('PollCount'));
      assert.equal(pollCount.toNumber(), 1);
      done();
    });

    it('and the poll status is not \'created\' , i.e. already \'open\' or \'resolved\', should fail', async function(done){
      await colony.createPoll('poll 1');
      colony.openPoll(1, 24).catch(testHelper.ifUsingTestRPC);
      var pollCount = await eternalStorage.getUIntValue.call(solSha3('PollCount'));
      assert.equal(pollCount.toNumber(), 1);
      done();
    });
  });

  describe('when poll has closed', function(){
    it('should not allow any more votes in', async function(done){
      await createAndOpenSimplePoll('poll 1',1);
      testHelper.forwardTime(3600 + 1000); // fast forward in time to get past the poll close time of 1 hour

      await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});

      var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
      var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
      assert.equal(zeroEntryPrevKey.toNumber(), 0);
      assert.equal(zeroEntryNextKey.toNumber(), 0);

      done();
    });
  });

  describe('when resolving a poll', function(){
    it('should update the poll status correctly', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1',1);
        testHelper.forwardTime(3600*2 + 1000);
        await colony.resolvePoll(1);
        var pollStatus = await eternalStorage.getUIntValue.call(solSha3('Poll', 1, 'status'));
        assert.equal(2, pollStatus.toNumber());
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('before the minimum needed time to have passed, it should fail', async function(done){
      await createAndOpenSimplePoll('poll 1',1);
      await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
      testHelper.forwardTime(3600 + 1000); // fast forward in time to get past the poll close time of 1 hour
      // Try to resolve the poll early
      await colony.resolvePoll(1);
      var pollStatus = await eternalStorage.getUIntValue.call(solSha3('Poll', 1, 'status'));
      assert.equal(1, pollStatus.toNumber());
      done();
    });

    it('which has already been resolved, it should fail', async function(done){
      await createAndOpenSimplePoll('poll 1',1);
      testHelper.forwardTime(3600*2 + 1000);
      await colony.resolvePoll(1);
      var pollStatus = await eternalStorage.getUIntValue.call(solSha3('Poll', 1, 'status'));
      assert.equal(2, pollStatus.toNumber());
      // Try to resolve the poll again
      await colony.resolvePoll(1).catch(testHelper.ifUsingTestRPC);
      done();
    });
  });

  describe('when submitting a vote', function () {
    it('to the start of a list of existing votes at a pollCloseTime that already exists, the linked list works as expected', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 25);
        await createAndOpenSimplePoll('poll 3', 25);
        testHelper.mineTransaction();

        await colony.submitVote(_POLL_ID_3_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});

        var poll2CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_2_, 'closeTime'));
        var poll3CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_3_, 'closeTime'));

        //Check it's been inserted correctly
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, poll2CloseTime.toNumber(), 'secrets', _POLL_ID_2_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, poll2CloseTime.toNumber(), 'secrets', _POLL_ID_2_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_3_);

        var newEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, poll3CloseTime.toNumber(), 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(newEntryPrevKey.toNumber(), _POLL_ID_2_);
        var newEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, poll3CloseTime.toNumber(), 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(newEntryNextKey.toNumber(), 0);
        done();
      } catch (err) {
        return done(err);
      }
    });

    it('in the middle of a list of existing votes at a pollCloseTime that already exists, the linked list works as expected', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 24);
        await createAndOpenSimplePoll('poll 3', 24);
        testHelper.mineTransaction();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_3_, _VOTE_SECRET_3_, 0, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

        //Add another one at the same timestamp in the middle of the votes list
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_2_, 0, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

        var pollCloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));

        //Check it's been inserted correctly afterwards into the linked list
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime.toNumber(), 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime.toNumber(), 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_2_);

        var newEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime.toNumber(), 'secrets', _POLL_ID_2_, 'prevPollId'));
        assert.equal(newEntryPrevKey.toNumber(), _POLL_ID_1_);
        var newEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime.toNumber(), 'secrets', _POLL_ID_2_, 'nextPollId'));
        assert.equal(newEntryNextKey.toNumber(), _POLL_ID_3_);

        var lastEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime.toNumber(), 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(lastEntryPrevKey.toNumber(), _POLL_ID_2_);
        var lastEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime.toNumber(), 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(lastEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it('to the end of list of existing votes at a pollCloseTime that already exists, the linked list works as expected', async function (done) {
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 24);
        testHelper.mineTransaction();

        var pollCloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_2_, 0, 0, {from: _OTHER_ACCOUNT_});

        //Add another one at the same timestamp
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_3_, 0, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

        //Check it's been inserted correctly afterwards into the linked list
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime.toNumber(), 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime.toNumber(), 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_2_);

        var newEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime.toNumber(), 'secrets', _POLL_ID_2_, 'prevPollId'));
        assert.equal(newEntryPrevKey.toNumber(), _POLL_ID_1_);
        var newEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime.toNumber(), 'secrets', _POLL_ID_2_, 'nextPollId'));
        assert.equal(newEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it.only('if the supplied previous pollId does not exist, it should fail', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 24);
        await createAndOpenSimplePoll('poll 3', 24);
        testHelper.mineTransaction();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        testHelper.mineTransaction();
        await colony.submitVote(_POLL_ID_3_, _VOTE_SECRET_1_, 0, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});
        testHelper.mineTransaction();
        //Add another one at the same timestamp but with a nonexistent prevPollId
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_3_, 0, _POLL_ID_4_, {from: _OTHER_ACCOUNT_});
        testHelper.mineTransaction();
        var pollCloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        pollCloseTime = pollCloseTime.toNumber();
        console.log('Poll 1 close time : ', pollCloseTime);

        var poll2CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_2_, 'closeTime'));
        poll2CloseTime = poll2CloseTime.toNumber();
        console.log('Poll 2 close time : ', poll2CloseTime);

        var poll3CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_3_, 'closeTime'));
        poll3CloseTime = poll3CloseTime.toNumber();
        console.log('Poll 3 close time : ', poll3CloseTime);

        //Check the new item hasn't been inserted
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_3_);

        var lastEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(lastEntryPrevKey.toNumber(), _POLL_ID_1_);
        var lastEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(lastEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it('if the supplied previous pollId implies a next pollId that is too small, it should fail', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 24);
        await createAndOpenSimplePoll('poll 3', 24);
        await createAndOpenSimplePoll('poll 4', 24);
        testHelper.mineTransaction();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_3_, _VOTE_SECRET_1_, 0, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

        // Add another one at the same timestamp but a prevPollId which is lower (1) than the correct one (3)
        await colony.submitVote(_POLL_ID_4_, _VOTE_SECRET_2_, 0, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

        var pollCloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        pollCloseTime = pollCloseTime.toNumber();

        //Check the new item hasn't been inserted
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_3_);

        var lastEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(lastEntryPrevKey.toNumber(), _POLL_ID_1_);
        var lastEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(lastEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it('if the supplied previous pollId is too large, it should fail', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 24);
        await createAndOpenSimplePoll('poll 3', 24);
        await createAndOpenSimplePoll('poll 4', 24);
        testHelper.mineTransaction();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_3_, _VOTE_SECRET_3_, 0, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_4_, _VOTE_SECRET_1_, 0, _POLL_ID_3_, {from: _OTHER_ACCOUNT_});

        // Add another one at the same timestamp but a prevPollId which is higher (3) than the correct one (1)
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_2_, 0, _POLL_ID_4_, {from: _OTHER_ACCOUNT_});

        var pollCloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        pollCloseTime = pollCloseTime.toNumber();

        //Check the new item hasn't been inserted
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_3_);

        var midEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(midEntryPrevKey.toNumber(), _POLL_ID_1_);
        var midEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(midEntryNextKey.toNumber(), _POLL_ID_4_);

        var lastEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_4_, 'prevPollId'));
        assert.equal(lastEntryPrevKey.toNumber(), _POLL_ID_3_);
        var lastEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_4_, 'nextPollId'));
        assert.equal(lastEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it('if the new secret is proposed to be at the start, but that is wrong, it should fail', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 24);
        await createAndOpenSimplePoll('poll 3', 24);
        testHelper.mineTransaction();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_3_, _VOTE_SECRET_1_, 0, _POLL_ID_1_, {from: _OTHER_ACCOUNT_});

        //Add another one at the same timestamp but with prevPollId=0, i.e. at the start where it doesn't order properly with other polls
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_2_, 0, 0, {from: _OTHER_ACCOUNT_});

        var pollCloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        pollCloseTime = pollCloseTime.toNumber();

        //Check the new item hasn't been inserted
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), _POLL_ID_3_);

        var lastEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_3_, 'prevPollId'));
        assert.equal(lastEntryPrevKey.toNumber(), _POLL_ID_1_);
        var lastEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_3_, 'nextPollId'));
        assert.equal(lastEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it('if the new secret is for the same poll as an existing vote (voting twice for same poll), it should fail', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        testHelper.mineTransaction();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        //try voting again for the same poll
        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_2_, 0, 0, {from: _OTHER_ACCOUNT_});

        var pollCloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        pollCloseTime = pollCloseTime.toNumber();

        //Check the new item hasn't been inserted
        var poll1Secret = await eternalStorage.getBytes32Value(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'secret'));
        assert.equal(_VOTE_SECRET_1_, poll1Secret);
        var firstEntryPrevKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        assert.equal(firstEntryPrevKey.toNumber(), 0);
        var firstEntryNextKey = await eternalStorage.getUIntValue.call(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(firstEntryNextKey.toNumber(), 0);
        done();

      } catch (err) {
        return done(err);
      }
    });

    it('for a poll at a pollCloseTime and its secret, as the first items in the 2 linked lists, should be added to linked lists correctly', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        testHelper.mineTransaction();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});

        var pollCloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        pollCloseTime = pollCloseTime.toNumber();

        // Check the pollCloseTime is added correctly
        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey, 0);
        assert.equal(newEntryNextKey, 0);

        // Check the secret is added correctly
        var newPollEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'prevPollId'));
        var newPollEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'nextPollId'));
        assert.equal(newPollEntryPrevKey, 0);
        assert.equal(newPollEntryNextKey, 0);
        var poll1Secret = await eternalStorage.getBytes32Value(solSha3('Voting', _OTHER_ACCOUNT_, pollCloseTime, 'secrets', _POLL_ID_1_, 'secret'));
        assert.equal(_VOTE_SECRET_1_, poll1Secret);

        // Check the '0' pollCloseTime points to this pollCloseTime correctly
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), pollCloseTime);
        assert.equal(zeroEntryNextKey.toNumber(), pollCloseTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    it('for a poll at a new pollCloseTime at the start of that list, should be added to linked list correctly', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 23);
        testHelper.mineTransaction();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_2_, 0, 0, {from: _OTHER_ACCOUNT_});

        var poll1CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        poll1CloseTime = poll1CloseTime.toNumber();
        var poll2CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_2_, 'closeTime'));
        poll2CloseTime = poll2CloseTime.toNumber();

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll2CloseTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll2CloseTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), 0);
        assert.equal(newEntryNextKey.toNumber(), poll1CloseTime);

        // Check the '0' pollCloseTime points to the correct pollCloseTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), poll1CloseTime);
        assert.equal(zeroEntryNextKey.toNumber(), poll2CloseTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    it('for a poll at a new pollCloseTime in the middle of that list, should be added to linked list correctly', async function(done){
      await createAndOpenSimplePoll('poll 1', 24);
      await createAndOpenSimplePoll('poll 2', 24);
      await createAndOpenSimplePoll('poll 3', 25);
      await createAndOpenSimplePoll('poll 4', 26);
      testHelper.mineTransaction();

      var poll1CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
      poll1CloseTime = poll1CloseTime.toNumber();
      var poll3CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_3_, 'closeTime'));
      poll3CloseTime = poll3CloseTime.toNumber();
      var poll4CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_4_, 'closeTime'));
      poll4CloseTime = poll4CloseTime.toNumber();

      await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
      await colony.submitVote(_POLL_ID_4_, _VOTE_SECRET_4_, poll1CloseTime, 0, {from: _OTHER_ACCOUNT_});
      await colony.submitVote(_POLL_ID_3_, _VOTE_SECRET_3_, poll1CloseTime, 0, {from: _OTHER_ACCOUNT_});

      var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll3CloseTime, 'prevTimestamp'));
      var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll3CloseTime, 'nextTimestamp'));
      assert.equal(newEntryPrevKey.toNumber(), poll1CloseTime);
      assert.equal(newEntryNextKey.toNumber(), poll4CloseTime);

      // Check the '0' pollCloseTime points to the correct pollCloseTimes
      var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
      var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
      assert.equal(zeroEntryPrevKey.toNumber(), poll4CloseTime);
      assert.equal(zeroEntryNextKey.toNumber(), poll1CloseTime);
      done();
    });

    it('for a poll at a new pollCloseTime at the end of that list, should be added to linked list correctly', async function(done) {
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 25);
        testHelper.mineTransaction();

        var poll1CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        poll1CloseTime = poll1CloseTime.toNumber();
        var poll2CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_2_, 'closeTime'));
        poll2CloseTime = poll2CloseTime.toNumber();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_2_, poll1CloseTime, 0, {from: _OTHER_ACCOUNT_});

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll2CloseTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll2CloseTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), poll1CloseTime);
        assert.equal(newEntryNextKey.toNumber(), 0);

        // Check the '0' pollCloseTime points to the correct pollCloseTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), poll2CloseTime);
        assert.equal(zeroEntryNextKey.toNumber(), poll1CloseTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    it('if the supplied previous closeTime does not exist, it should fail', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 25);
        testHelper.mineTransaction();

        var poll1CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        poll1CloseTime = poll1CloseTime.toNumber();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_2_, poll1CloseTime - 10, 0, {from: _OTHER_ACCOUNT_});

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll1CloseTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll1CloseTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), 0);
        assert.equal(newEntryNextKey.toNumber(), 0);

        // Check the '0' pollCloseTime points to the correct pollCloseTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), poll1CloseTime);
        assert.equal(zeroEntryNextKey.toNumber(), poll1CloseTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    it('if the new lock is proposed to be at the start, but that is wrong, it should fail', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 25);
        testHelper.mineTransaction();

        var poll1CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        poll1CloseTime = poll1CloseTime.toNumber();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_2_, 0, 0, {from: _OTHER_ACCOUNT_});

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll1CloseTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll1CloseTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), 0);
        assert.equal(newEntryNextKey.toNumber(), 0);

        // Check the '0' pollCloseTime points to the correct pollCloseTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), poll1CloseTime);
        assert.equal(zeroEntryNextKey.toNumber(), poll1CloseTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    it('if the supplied previous closeTime implies a next closeTime that is too small, it should fail', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 26);
        await createAndOpenSimplePoll('poll 3', 27);
        await createAndOpenSimplePoll('poll 4', 28);
        testHelper.mineTransaction();

        var poll1CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        poll1CloseTime = poll1CloseTime.toNumber();
        var poll2CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_2_, 'closeTime'));
        poll2CloseTime = poll2CloseTime.toNumber();
        var poll4CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_4_, 'closeTime'));
        poll4CloseTime = poll4CloseTime.toNumber();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_2_, poll1CloseTime, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_4_, _VOTE_SECRET_4_, poll2CloseTime, 0, {from: _OTHER_ACCOUNT_});

        // Try inserting pollCloseTime at a position lower than the correct one
        await colony.submitVote(_POLL_ID_3_, _VOTE_SECRET_3_, poll1CloseTime, 0, {from: _OTHER_ACCOUNT_});

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll1CloseTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll1CloseTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), 0);
        assert.equal(newEntryNextKey.toNumber(), poll2CloseTime);

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll2CloseTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll2CloseTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), poll1CloseTime);
        assert.equal(newEntryNextKey.toNumber(), poll4CloseTime);

        // Check the '0' pollCloseTime points to the correct pollCloseTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), poll4CloseTime);
        assert.equal(zeroEntryNextKey.toNumber(), poll1CloseTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });

    it('if the supplied previous closeTime is too large, it should fail', async function(done){
      try {
        await createAndOpenSimplePoll('poll 1', 24);
        await createAndOpenSimplePoll('poll 2', 26);
        await createAndOpenSimplePoll('poll 3', 25);
        await createAndOpenSimplePoll('poll 4', 28);
        testHelper.mineTransaction();

        var poll1CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_1_, 'closeTime'));
        poll1CloseTime = poll1CloseTime.toNumber();
        var poll2CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_2_, 'closeTime'));
        poll2CloseTime = poll2CloseTime.toNumber();
        var poll4CloseTime = await eternalStorage.getUIntValue.call(solSha3('Poll', _POLL_ID_4_, 'closeTime'));
        poll4CloseTime = poll4CloseTime.toNumber();

        await colony.submitVote(_POLL_ID_1_, _VOTE_SECRET_1_, 0, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_2_, _VOTE_SECRET_2_, poll1CloseTime, 0, {from: _OTHER_ACCOUNT_});
        await colony.submitVote(_POLL_ID_4_, _VOTE_SECRET_4_, poll2CloseTime, 0, {from: _OTHER_ACCOUNT_});

        // Try inserting pollCloseTime at a position higher than the correct one
        await colony.submitVote(_POLL_ID_3_, _VOTE_SECRET_3_, poll2CloseTime, 0, {from: _OTHER_ACCOUNT_});

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll1CloseTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll1CloseTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), 0);
        assert.equal(newEntryNextKey.toNumber(), poll2CloseTime);

        var newEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll2CloseTime, 'prevTimestamp'));
        var newEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, poll2CloseTime, 'nextTimestamp'));
        assert.equal(newEntryPrevKey.toNumber(), poll1CloseTime);
        assert.equal(newEntryNextKey.toNumber(), poll4CloseTime);

        // Check the '0' pollCloseTime points to the correct pollCloseTimes
        var zeroEntryPrevKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'prevTimestamp'));
        var zeroEntryNextKey = await eternalStorage.getUIntValue(solSha3('Voting', _OTHER_ACCOUNT_, 0, 'nextTimestamp'));
        assert.equal(zeroEntryPrevKey.toNumber(), poll4CloseTime);
        assert.equal(zeroEntryNextKey.toNumber(), poll1CloseTime);
        done();
      }
      catch (err) {
        return done(err);
      }
    });
  });

  describe.skip('when revealing a vote', function(){
    it.skip('before the poll has closed, should fail', async function(done){});
    it.skip('and the poll is resolved, should not count the vote towards final results', async function(done){});
    it.skip('with invalid secret, should fail', async function(done){});
    it.skip('should update the total count for that vote option', async function(done){});
    it.skip('should remove the vote secret from the doubly linked list', async function(done){});
  });
});