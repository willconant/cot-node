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

var viewQueryKeys = [
	'descending', 'endkey', 'endkey_docid', 'group',
	'group_level', 'include_docs', 'inclusive_end', 'key',
	'limit', 'reduce', 'skip', 'stale',
	'startkey', 'startkey_docid', 'update_seq'
];

var changesQueryKeys = ['filter', 'include_docs', 'limit', 'since', 'timeout'];

module.exports = Cot;

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
	reqOpts: function (method, path, headers) {
		var opts = {
			hostname: this.hostname,
			port: this.port,
			auth: this.auth,
			path: path,
			method: method,
			headers: headers || {}
		};
		
		opts.headers.host = this.hostHeader;
				
		return opts;
	},
	
	processResponse: function (request, next) {
		waitForResponse(request, onWaitForResponse);
		
		function onWaitForResponse(err, response) {
			if (err) { next(err); return; }
			
			if (response.statusCode >= 300 || response.headers['content-type'] === 'application/json') {
				readAllText(response, response.statusCode >= 300 ? 8192 : null, onReadAllText);
			}
			else {
				next(null, response);
			}
			
			function onReadAllText(err, buffer) {
				if (err) { next(err); return; }
				
				response.body = buffer;
				
				if (response.headers['content-type'] === 'application/json') {
					trycatch(function (_) { return JSON.parse(response.body); }, onParsed);
				}
				else {
					next(null, response);
				}
			}
			
			function onParsed(err, json) {
				if (err) { next(err); return; }
				
				response.json = json;
				next(null, response);
			}
		}
	},
	
	GET: function (path, headers, next) {
		headers = headers || {};
		if (!headers.accept) {
			headers.accept = 'application/json';
		}
	
		var request = this.http.request(this.reqOpts('GET', path, headers));
		this.processResponse(request, next);
	},
	
	DELETE: function (path, headers, next) {
		headers = headers || {};
		if (!headers.accept) {
			headers.accept = 'application/json';
		}
	
		var request = this.http.request(this.reqOpts('DELETE', path, headers));
		this.processResponse(request, next);
	},
	
	putOrPost: function (which, path, body, headers, next) {
		headers = headers || {};
		if (!headers.accept) {
			headers.accept = 'application/json';
		}
		
		if (typeof(body) === 'object' && !headers['content-type']) {
			body = JSON.stringify(body);
			headers['content-type'] = 'application/json';
		}
		else if (typeof(body) === 'string') {
			body = new Buffer(body, 'utf8');
		}
		
		var request = this.http.request(this.reqOpts(which, path, headers));
		request.write(body);
		this.processResponse(request, next);
	},
	
	PUT: function (path, body, headers, next) {
		this.putOrPost('PUT', path, body, headers, next);
	},
	
	POST: function (path, body, headers, next) {
		this.putOrPost('POST', path, body, headers, next);
	},
	
	db: function (name) {
		return new DbHandle(this, name);
	}
};

function DbHandle(cot, name) {
	this.cot = cot;
	this.name = name;
}

DbHandle.prototype = {
	docUrl: function (docId) {
		if (docId.indexOf('_design/') !== 0) {
			docId = encodeURIComponent(docId);
		}
		return '/' + this.name + '/' + docId;
	},
	
	info: function (next) {
		this.cot.GET('/' + this.name, null, function (err, response) {
			if (err) { next(err); return; }
			
			next(null, response.json);
		});
	},

	getDoc: function (docId, next) {
		this.cot.GET(this.docUrl(docId), null, function (err, response) {
			if (err) { next(err); return; }
			if (response.statusCode === 404) { next(null, null); return; }
			if (response.statusCode !== 200) { next(new Error('error getting doc ' + docId + ': ' + response.body)); return; }
			next(null, response.json);
		});
	},
	
	getDocWhere: function (docId, condition, next) {
		this.getDoc(docId, function (err, doc) {
			if (err) { next(err); return; }
			
			if (doc !== null && condition(doc)) {
				next(null, doc);
			}
			else {
				next(null, null);
			}
		});
	},
	
	putDoc: function (doc, opts, next) {
		if (typeof next === 'undefined') {
			next = opts;
			opts = null;
		}
		
		var url = this.docUrl(doc._id);
		if (opts && opts.batch) {
			url += '?batch=ok';
		}
		
		this.cot.PUT(url, doc, null, function (err, response) {
			if (err) { next(err); return; }
			
			if (response.statusCode === 201 || response.statusCode === 202 || (response.statusCode === 409 && opts && opts.conflictOk)) {
				next(null, response.json);
			}
			else {
				next(new Error('error putting doc ' + doc._id + ': ' + response.body));
			}
		});
	},
	
	updateDoc: function (docId, fn, next) {
		var db = this;
		
		tryIt();
	
		function tryIt() {
			db.getDoc(docId, onGot);
		}
		
		function onGot(err, doc) {
			if (err) { next(err); return; }
			
			if (doc === null) {
				doc = {_id: docId};
			}
			fn(doc, onApplied);
		}
		
		function onApplied(err, doc) {
			if (err) { next(err); return; }
			db.putDoc(doc, {conflictOk: true}, onPut);
		}
		
		function onPut(err, response) {
			if (err) { next(err); return; }
			
			if (response.ok) {
				next(null, response);
			}
			else {
				tryIt();
			}
		}
	},
	
	deleteDoc: function (docId, rev, opts, next) {
		if (typeof next === 'undefined') {
			next = opts;
			opts = null;
		}
	
		var url = this.docUrl(docId) + '?rev=' + encodeURIComponent(rev);
		
		this.cot.DELETE(url, null, function (err, response) {
			if (err) { next(err); return; }
			
			if (response.statusCode === 200 || (response.statusCode === 409 && opts && opts.conflictOk)) {
				next(null, response.json);
			}
			else {
				next(new Error('error deleting doc ' + docId + ': ' + response.body));
			}
		});
	},
	
	viewQuery: function (path, query, next) {
		if (typeof next === 'undefined') {
			next = query;
			query = null;
		}
	
		query = query || {};
		var url = '/' + this.name + '/' + path;
		var q = {};
		viewQueryKeys.forEach(function (key) {
			if (typeof query[key] !== 'undefined') {
				if (key === 'startkey_docid' || key === 'endkey_docid') {
					q[key] = query[key];
				}
				else {
					q[key] = JSON.stringify(query[key]);
				}
			}
		});
		
		this.cot.GET(url + '?' + querystring.stringify(q), null, function (err, response) {
			if (err) { next(err); return; }
			
			if (response.statusCode !== 200) {
				next(new Error('error reading view ' + path + ': ' + response.body));
			}
			else {
				next(null, response.json);
			}
		});
	},
	
	view: function (designName, viewName, query, next) {
		this.viewQuery('_design/' + designName + '/_view/' + viewName, query, next);
	},
	
	allDocs: function (query, next) {
		this.viewQuery('_all_docs', query, next);
	},
	
	viewKeysQuery: function (path, keys, next) {
		var url = '/' + this.name + '/' + path;
		this.cot.POST(url, {keys: keys}, null, function (err, response) {
			if (err) { next(err); return; }
			
			if (response.statusCode !== 200) {
				next(new Error('error reading view ' + path + ': ' + response.body));
			}
			else {
				next(null, response.json);
			}
		});
	},
	
	viewKeys: function (designName, viewName, keys, next) {
		this.viewKeysQuery('_design/' + designName + '/_view/' + viewName, keys, next);
	},
	
	allDocsKeys: function (keys, next) {
		this.viewKeysQuery('_all_docs', keys, next);
	},
	
	postBulkDocs: function (docs, allOrNothing, next) {
		if (typeof next === 'undefined') {
			next = allOrNothing;
			allOrNothing = false;
		}
		
		var url = '/' + this.name + '/_bulk_docs';
		this.cot.POST(url, {docs: docs, all_or_nothing: allOrNothing}, null, function (err, response) {
			if (err) { next(err); return; }
			
			if (response.statusCode !== 201) {
				next(new Error('error posting to _bulk_docs:' + response.body));
			}
			else {
				next(null, response.json);
			}
		});
	},
	
	changes: function (query, next) {
		if (typeof next === 'undefined') {
			next = query;
			query = null;
		}
	
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

		this.cot.GET('/' + this.name + '/_changes?' + querystring.stringify(q), null, function (err, response) {
			if (err) { next(err); return; }
			
			if (response.statusCode !== 200) {
				next(new Error('error reading _changes: ' + response.body));
			}
			else {
				next(null, response.json);
			}
		});
	}
};

function waitForResponse(request, next) {
	next = once(next);
	
	request.on('error', next);
	
	request.on('response', function (response) {
		next(null, response);
	});
	
	request.end();
}

function readAllText(stream, limit, next) {
	next = once(next);
	var buffer = '';
	stream.encoding = 'utf8';
	
	stream.on('data', function (chunk) {
		if (!limit || buffer.length < limit) {
			buffer += chunk;
		}
	});
	
	stream.on('error', next);
	
	stream.on('end', function () {
		next(null, buffer);
	});
}

function trycatch(fn, next) {
	try {
		next(null, fn());
	}
	catch (err) {
		next(err);
	}
}

function once(f) {
	var called = false;
	return function() {
		if (!called) {
			called = true;
			return f.apply(this, arguments);
		}
	};
}
