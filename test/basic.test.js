var chai = require('chai');
var expect = chai.expect;
var Cot = require('../cot');

describe('DbHandle', function() {
	var port = 5984;
	var hostname = 'localhost';
	var dbName = 'test-cot-node';
	
	var cot = new Cot(port, hostname);
	var db = cot.db(dbName);
	
	beforeEach(function(done) {
		cot.DELETE('/' + dbName, {}, onDelete);
		
		function onDelete(err) {
			if (err) {
				done(err);
			}
			else {
				cot.PUT('/' + dbName, '', {}, onPut);
			}
		}
		
		function onPut(err) {
			if (err) {
				done(err);
			}
			else {
				db.putDoc({_id: 'person-1', type: 'person', name: 'Will Conant'}, done);
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
					expect(info.doc_count).to.equal(1);
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
});
