var chai = require('chai');
var expect = chai.expect;
var Cot = require('../cot');
var config = require('./config');

describe('DbHandle', function() {	
	var cot = new Cot(config.serverOpts);
	var db = cot.db(config.dbName);
	
	beforeEach(function(done) {
		cot.DELETE('/' + config.dbName, {}, thenPutDB);
		
		function thenPutDB(err) {
			if (err) {
				done(err);
			}
			else {
				cot.PUT('/' + config.dbName, '', {}, thenPutDoc);
			}
		}
		
		var docNumber = 0;
		
		function thenPutDoc(err) {
			if (err) {
				done(err);
			}
			else {
				docNumber += 1;
				if (docNumber === 10) {
					db.putDoc({_id: '_design/test', views: {
						testView: {
							map: 'function(d) { emit(d.key, null); emit("z", null); }'
						}
					}}, done);
				}
				else {
					db.putDoc({_id: 'doc-' + docNumber, key: 'key-' + docNumber}, thenPutDoc);
				}
			}
		}
	});
	
	describe('#view', function() {
		it('should return doc-3 thru doc-6 using startkey_docid and endkey_docid', function(done) {
			db.view('test', 'testView', {key: 'z', startkey_docid: 'doc-3', endkey_docid: 'doc-6'}, onView);
			
			function onView(err, response) {
				if (err) {
					done(err)
				}
				else {
					expect(response.rows.length).to.equal(4);
					expect(response.rows[0].id).to.equal('doc-3');
					expect(response.rows[1].id).to.equal('doc-4');
					expect(response.rows[2].id).to.equal('doc-5');
					expect(response.rows[3].id).to.equal('doc-6');
					done();
				}
			}
		});
	});
});
