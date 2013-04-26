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
		cot.DELETE('/' + config.dbName, {}, onDelete);
		
		function onDelete(err) {
			if (err) {
				done(err);
			}
			else {
				cot.PUT('/' + config.dbName, '', {}, onPut);
			}
		}
		
		function onPut(err) {
			if (err) {
				done(err);
			}
			else {
				db.putDoc({_id: 'person-1', type: 'person', name: 'Will Conant'}, onPutDoc);
			}
		}
		
		function onPutDoc(err) {
			if (err) {
				done(err);
			}
			else {
				db.putDoc({_id: '_design/test', views: {
					testView: {
						map: 'function(d) { emit(d.name, null) }'
					}
				}}, done);
			}
		}
	});
	
	describe('#info', function() {
		it('should return database info', function(done) {
			db.info(onInfo);
			
			function onInfo(err, info) {
				if (err) {
					done(err);
				}
				else {
					expect(info).to.be.a('object');
					expect(info.doc_count).to.equal(2);
					done();
				}
			}
		});
	});
	
	describe('#getDoc', function() {
		it('should return test document from database', function(done) {
			db.getDoc('person-1', onGet);
			
			function onGet(err, doc) {
				if (err) {
					done(err);
				}
				else {
					expect(doc).to.be.a('object');
					expect(doc.name).to.equal('Will Conant');
					done();
				}
			}
		});
	});
	
	describe('#getDocWhere', function() {
		it('should return null when condition does not match', function(done) {
			db.getDocWhere('person-1', function(doc) { return doc.type === 'clown' }, onGetDoc)
			
			function onGetDoc(err, doc) {
				if (err) {
					done(err);
				}
				else {
					expect(doc).to.be.null;
					done();
				}
			}
		});
		
		it('should return doc when condition matches', function(done) {
			db.getDocWhere('person-1', function(doc) { return doc.type === 'person' }, onGetDoc)
			
			function onGetDoc(err, doc) {
				if (err) {
					done(err);
				}
				else {
					expect(doc).to.be.a('object');
					expect(doc.name).to.equal('Will Conant');
					done();
				}
			}
		});
	});
	
	describe('#view', function() {
		it('should return a single row', function(done) {
			db.view('test', 'testView', {}, onView);
			
			function onView(err, response) {
				if (err) {
					done(err)
				}
				else {
					expect(response).to.be.object;
					expect(response.rows).to.be.array;
					expect(response.rows.length).to.equal(1);
					expect(response.rows[0].key).to.equal('Will Conant');
					done();
				}
			}
		});
	});
});
