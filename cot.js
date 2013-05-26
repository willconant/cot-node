/*
Copyright (c) 2013 Will Conant, http://willconant.com/

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

'use strict';

var querystring = require('querystring');
var Q = require('q');

module.exports = Cot;

var viewQueryKeys = [
	'descending', 'endkey', 'endkey_docid', 'group',
	'group_level', 'include_docs', 'inclusive_end', 'key',
	'limit', 'reduce', 'skip', 'stale',
	'startkey', 'startkey_docid', 'update_seq'
];

var changesQueryKeys = ['filter', 'include_docs', 'limit', 'since', 'timeout'];

function Cot(opts) {
	this.port = opts.port;
	this.hostname = opts.hostname;
	this.auth = opts.auth;
	this.ssl = opts.ssl;
	this.http = opts.ssl ? require('https') : require('http');
	this.hostHeader = this.hostname;
	if ((!this.ssl && this.port !== 80) || (this.ssl && this.port !== 443)) {
		this.hostHeader += ':' + this.port;
	}
}

Cot.prototype = {
	jsonRequest: function(method, path, body) {
		var deferred = Q.defer();
		
		var headers = {};
		headers['accept'] = 'application/json';
		headers['host'] = this.hostHeader;
		if (body) {
			headers['content-type'] = 'application/json';
		}
				
		var request = this.http.request({
			hostname: this.hostname,
			port: this.port,
			auth: this.auth,
			path: path,
			method: method,
			headers: headers
		});
		
		request.on('error', deferred.reject.bind(deferred));
		
		request.on('response', function(response) {
			response.setEncoding('utf8');
			
			var buffer = '';
			response.on('data', function(data) {
				buffer += data;
			});
			
			response.on('error', deferred.reject.bind(deferred));
			
			response.on('end', function() {
				var myResponse = {
					statusCode: response.statusCode,
					unparsedBody: buffer
				};
				
				if (response.headers['content-type'] === 'application/json') {
					try {
						myResponse.body = JSON.parse(buffer);
					} catch (err) {
						deferred.reject(err);
						return;
					}
				}
				
				deferred.resolve(myResponse);
			});
		});
		
		if (body) {
			request.end(JSON.stringify(body));
		} else {
			request.end();
		}
		
		return deferred.promise;
	},
	
	db: function(name) {
		return new DbHandle(this, name);
	}
};

function DbHandle(cot, name) {
	this.cot = cot;
	this.name = name;
}

DbHandle.prototype = {
	docUrl: function(docId) {
		if (typeof docId !== 'string' || docId.length === 0) {
			throw new TypeError('doc id must be a non-empty string');
		}
		
		if (docId.indexOf('_design/') === 0) {
			return '/' + this.name + '/_design/' + encodeURIComponent(docId.substr(8));
		} else {
			return '/' + this.name + '/' + encodeURIComponent(docId);
		}
	},
	
	info: function() {
		return this.cot.jsonRequest('GET', '/' + this.name)
		.then(function(response) {
			return response.body;
		});
	},

	get: function(docId) {
		return this.cot.jsonRequest('GET', this.docUrl(docId))
		.then(function(response) {
			if (response.statusCode !== 200) {
				throw new Error('error getting doc ' + docId + ': ' + response.unparsedBody);
			} else {
				return response.body;
			}
		});
	},
	
	exists: function(docId) {
		return this.cot.jsonRequest('GET', this.docUrl(docId))
		.then(function(response) {
			if (response.statusCode === 404) {
				return null;
			} else if (response.statusCode !== 200) {
				throw new Error('error getting doc ' + docId + ': ' + response.unparsedBody);
			} else {
				return response.body;
			}
		});
	},
	
	put: function(doc) {		
		return this.cot.jsonRequest('PUT', this.docUrl(doc._id), doc)
		.then(function(response) {
			if (response.statusCode === 201 || response.statusCode === 409) {
				return response.body;
			} else {
				throw new Error('error putting doc ' + doc._id + ': ' + response.unparsedBody);
			}
		});
	},
	
	post: function(doc) {
		return this.cot.jsonRequest('POST', '/' + this.name, doc)
		.then(function(response) {
			if (response.statusCode === 201) {
				return response.body;
			} else if (doc._id) {
				throw new Error('error posting doc ' + doc._id + ': ' + response.unparsedBody);
			} else {
				throw new Error('error posting new doc: ' + response.unparsedBody);
			}
		});
	},
	
	batch: function(doc) {
		return this.cot.jsonRequest('POST', '/' + this.name + '?batch=ok', doc)
		.then(function(response) {
			if (response.statusCode === 202) {
				return response.body;
			} else if (doc._id) {
				throw new Error('error batch posting doc ' + doc._id + ': ' + response.unparsedBody);
			} else {
				throw new Error('error batch posting new doc: ' + response.unparsedBody);
			}
		});
	},
	
	update: function(docId, fn) {
		var db = this;
		
		return tryIt();
	
		function tryIt() {
			return db.exists(docId)
			.then(function(doc) {
				return fn(doc || {_id: docId});
			})
			.then(function(doc) {
				return db.put(doc);
			})
			.then(function(response) {
				if (response.ok) {
					return response
				} else {
					return tryIt();
				}
			});
		}
	},
	
	delete: function(docId, rev) {
		var url = this.docUrl(docId) + '?rev=' + encodeURIComponent(rev);
		
		return this.cot.jsonRequest('DELETE', url)
		.then(function(response) {
			if (response.statusCode === 200) {
				return response.body;
			} else {
				throw new Error('error deleting doc ' + docId + ': ' + response.unparsedBody);
			}
		});
	},
	
	bulk: function(docs) {
		var url = '/' + this.name + '/_bulk_docs';
		return this.cot.jsonRequest('POST', url, {docs: docs})
		.then(function(response) {
			if (response.statusCode !== 201) {
				throw new Error('error posting to _bulk_docs:' + response.unparsedBody);
			} else {
				return response.body;
			}
		});
	},
	
	viewQuery: function(path, query) {	
		query = query || {};
		var url = '/' + this.name + '/' + path;
		var q = {};
		viewQueryKeys.forEach(function(key) {
			if (typeof query[key] !== 'undefined') {
				if (key === 'startkey_docid' || key === 'endkey_docid') {
					q[key] = query[key];
				} else {
					q[key] = JSON.stringify(query[key]);
				}
			}
		});
		
		return this.cot.jsonRequest('GET', url + '?' + querystring.stringify(q))
		.then(function(response) {
			if (response.statusCode !== 200) {
				throw new Error('error reading view ' + path + ': ' + response.unparsedBody);
			} else {
				return response.body;
			}
		});
	},
	
	view: function(designName, viewName, query) {
		return this.viewQuery('_design/' + designName + '/_view/' + viewName, query);
	},
	
	allDocs: function(query) {
		return this.viewQuery('_all_docs', query);
	},
	
	viewKeysQuery: function(path, keys) {
		var url = '/' + this.name + '/' + path;
		return this.cot.jsonRequest('POST', url, {keys: keys})
		.then(function(response) {
			if (response.statusCode !== 200) {
				throw new Error('error reading view ' + path + ': ' + response.unparsedBody);
			} else {
				return response.body;
			}
		});
	},
	
	viewKeys: function(designName, viewName, keys) {
		return this.viewKeysQuery('_design/' + designName + '/_view/' + viewName, keys);
	},
	
	allDocsKeys: function(keys) {
		return this.viewKeysQuery('_all_docs', keys);
	},
	
	changes: function(query) {	
		query = query || {};
		var q = {};
		changesQueryKeys.forEach(function (key) {
			if (typeof query[key] !== 'undefined') {
				q[key] = JSON.stringify(query[key]);
			}
		});
		
		if (query.longpoll === true) {
			q.feed = 'longpoll';
		}

		return this.cot.jsonRequest('GET', '/' + this.name + '/_changes?' + querystring.stringify(q))
		.then(function(response) {
			if (response.statusCode !== 200) {
				throw new Error('error reading _changes: ' + response.unparsedBody);
			} else {
				return response.body;
			}
		});
	}
};
