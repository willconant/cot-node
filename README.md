# What is Cot? #

Cot is a rather simple, but quite pleasant interface for CouchDB. It doesn't attempt to implement everything, but it covers the important stuff for using couch as an effective database.

    var Cot = require('cot');
    var cot = new Cot(5984, 'localhost');
    var db = cot.db('my-db');
    
    db.getDoc('counter', onGet);
    
    function onGet(err, doc) {
    	if (err) throw err;
    	
    	if (doc === null) {
    		doc = {
    			_id: 'counter',
    			count: 0
    		};
    	}
    	
    	doc.count += 1;
    	
    	db.putDoc(doc, {conflictOk: true}, onPut);
    }
    
    function onPut(err, response) {
    	if (err) throw err;
    	
    	if (response.conflict) {
    		db.getDoc('counter', onGet);
    	}
    	else {
    		console.log('done!');
    	}
    }

There's actually a utility function for an optimistic update loop:

    db.updateDoc('counter', mutate, onUpdate);
    
    function mutate(doc, next) {
    	doc.count = (doc.count || 0) + 1;
    	next();
    }
    
    function onUpdate(err) {
    	if (err) throw err;
    	console.log('done!');
    }

# API Reference #

## cot = new Cot(port, host) ##

## db = cot.db(dbName) ##

## db.info(next(err, info)) ##

Queries database info and calls next when done.

## db.getDoc(docId, next(err, doc))

Gets a doc out of the database. If the doc is missing, err will be null and doc will be null.

## db.getDocWhere(docId, condition(doc), next(err, doc))

Gets a doc out of the database and passes it to condition. If condition returns false, next will be called with doc === null as if the doc did not exist. This is useful for avoiding the easy mistake of writing code that allows access to your entire database:

    db.getDocWhere(query.docId, function(doc) { return doc.isPublic }, onGet);

## db.putDoc(doc, [opts,] next(err, response))

Attempts to put doc into database. The doc must have an `_id` field. If you expect to handle update conflicts, send {conflictOk: true} in opts. Otherwise, conflicts will be treated as errors. In any case, the response from couch is passed to next so you can retrieve the new rev or detect a conflict if `conflictOk: true`. Response may be something like:

    {ok: true, rev: '2-whatever'}

Or, in case of a conflict where `conflictOk: true`:

    {error: 'conflict'}

## db.updateDoc(doc, fn, next(err, response))

Reads doc from the database and calls `fn(doc, cb)`. `fn` may directly mutate doc and call `cb` when done. Then updateDoc will attempt to put the modified document back in the database. If there is an update conflict, the process will start over and repeat until success.

## db.deleteDoc(docId, rev, [opts,] next)

Attempts to delete the document with the specified docId and rev. As with putDoc, you may pass `{conflictOk: true}` in opts.

## db.view(designName, viewName, query, next(err, response))

Queries a view with the given name in the given design doc. `query` should be an object with any of the following keys:

  - descending
  - endkey
  - endkey_docid
  - group
  - group_level
  - include_docs
  - inclusive_end
  - key
  - limit
  - reduce
  - skip
  - stale
  - startkey
  - startkey_docid
  - update_seq

Refer to the CouchDB API documentation for their meanings.

## db.allDocs(query, next(err, response))

Queries the _all_docs view. `query` supports the same keys as in `db.view`.

## db.viewKeys(designName, viewName, keys, next(err, response))

Queries the specified keys from the specified view. Keys should be an array of keys.

## db.allDocsKeys(keys, next(err, response))

Loads documents with the specified keys.

## db.postBulkDocs(docs, allOrNothing, next(err, response))

## db.changes(query, next)

