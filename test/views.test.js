var chai = require('chai');
var expect = chai.expect;
var Cot = require('../cot');
var config = require('./config');
var Q = require('q');

describe('DbHandle', function() {	
	var cot = new Cot(config.serverOpts);
	var db = cot.db(config.dbName);
	
	beforeEach(function(done) {
		cot.jsonRequest('DELETE', '/' + config.dbName)
		.then(function() {
			return cot.jsonRequest('PUT', '/' + config.dbName);
		})
		.then(function() {
			var docPromises = [];
			for (var i = 1; i < 10; i++) {
				docPromises.push(db.post({_id: 'doc-' + i, key: 'key-' + i}));
			}
			
			var designDoc = {_id: '_design/test', views: {
				testView: {
					map: 'function(d) { emit(d.key, null); emit("z", null); }'
				}				
			}};
			docPromises.push(db.post(designDoc));
			
			return Q.all(docPromises);
		})
		.nodeify(done);
	});
	
	describe('#view', function() {
		it('should return doc-3 thru doc-6 using startkey_docid and endkey_docid', function(done) {
			db.view('test', 'testView', {key: 'z', startkey_docid: 'doc-3', endkey_docid: 'doc-6'})
			.then(function(response) {
				expect(response.rows.length).to.equal(4);
				expect(response.rows[0].id).to.equal('doc-3');
				expect(response.rows[1].id).to.equal('doc-4');
				expect(response.rows[2].id).to.equal('doc-5');
				expect(response.rows[3].id).to.equal('doc-6');
			})
			.nodeify(done);
		});
	});
});
