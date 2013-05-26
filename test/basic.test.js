var chai = require('chai');
var expect = chai.expect;
var Cot = require('../cot');
var config = require('./config');

describe('Cot', function() {
	it('should include port in host header when port not default for protocol', function() {
		var c1 = new Cot({port: 80, hostname: 'foo'});
		expect(c1.hostHeader).to.equal('foo');
		var c2 = new Cot({port: 8080, hostname: 'foo'});
		expect(c2.hostHeader).to.equal('foo:8080');
		var c3 = new Cot({port: 443, hostname: 'foo', ssl: true});
		expect(c3.hostHeader).to.equal('foo');
		var c4 = new Cot({port: 8080, hostname: 'foo', ssl: true});
		expect(c4.hostHeader).to.equal('foo:8080');
	});
});

describe('DbHandle', function() {	
	var cot = new Cot(config.serverOpts);
	var db = cot.db(config.dbName);
	
	beforeEach(function(done) {
		cot.jsonRequest('DELETE', '/' + config.dbName)
		.then(function() {
			return cot.jsonRequest('PUT', '/' + config.dbName);
		})
		.then(function() {
			return db.post({_id: 'person-1', type: 'person', name: 'Will Conant'});
		})
		.then(function() {
			return db.post({_id: '_design/test', views: {
				testView: {
					map: 'function(d) { emit(d.name, null) }'
				}
			}});
		})
		.nodeify(done);
	});
	
	describe('#docUrl', function() {
		it('should encode doc ids', function() {
			var encoded = db.docUrl('foo/bar');
			expect(encoded).to.equal('/test-cot-node/foo%2Fbar');
		});
	
		it('should not encode first slash in design doc ids', function() {
			var encoded = db.docUrl('_design/foo/bar');
			expect(encoded).to.equal('/test-cot-node/_design/foo%2Fbar');
		});
	});
	
	describe('#info', function() {
		it('should return database info', function(done) {
			db.info()
			.then(function(info) {
				expect(info).to.be.a('object');
				expect(info.doc_count).to.equal(2);
			})
			.nodeify(done);
		});
	});
	
	describe('#get', function() {
		it('should return test document from database', function(done) {
			db.get('person-1')
			.then(function(doc) {
				expect(doc).to.be.a('object');
				expect(doc.name).to.equal('Will Conant');
			})
			.nodeify(done);
		});
	});
	
	describe('#view', function() {
		it('should return a single row', function(done) {
			db.view('test', 'testView', {})
			.then(function(response) {
				expect(response).to.be.object;
				expect(response.rows).to.be.array;
				expect(response.rows.length).to.equal(1);
				expect(response.rows[0].key).to.equal('Will Conant');
			})
			.nodeify(done);
		});
	});
	
	describe('#put', function() {
		it('should treat conflicts as expected', function(done) {
			var doc = {_id: 'put-test'};
			db.put(doc)
			.then(function(response) {
				return db.put(doc);
			})
			.then(function(response) {
				expect(response.error).to.equal('conflict');
			})
			.nodeify(done);
		});
	});
	
	describe('#post', function() {
		it('should treat conflicts as errors', function(done) {
			var doc = {_id: 'post-test'};
			db.post(doc)
			.then(function(response) {
				return db.post(doc);
			})
			.then(function(response) {
				done(new Error('should not have resolved'));
			})
			.fail(function() {
				done();
			})
			.done();
		});
	});
	
	describe('#batch', function() {
		it('should ignore conflicts', function(done) {
			var doc = {_id: 'batch-test'};
			var origRev;
			db.post(doc)
			.then(function(response) {
				origRev = response.rev;
				return db.batch(doc);
			})
			.delay(100)
			.then(function(response) {
				return db.get(doc._id);
			})
			.then(function(response) {
				expect(response._rev).to.equal(origRev);
			})
			.nodeify(done);
		});
	});
	
	describe('#exists', function() {
		it('should return null for nonexistent doc', function(done) {
			db.exists('does-not-exist')
			.then(function(doc) {
				expect(doc).to.be.null;
			})
			.nodeify(done);
		});
	});
});
