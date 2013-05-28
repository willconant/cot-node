# What is Cot? #

Cot is a CouchDB library for nodejs with the following benefits:

  - It produces promises using the excellent Q module.
  - It has clear method names that map almost directly to CouchDB's HTTP API.
  - It takes advantage of redundancies in the CouchDB API to map responses back to promises.
    For instance, `post()` treats conflicts as errors, but `put()` treats 
    conflicts as a normal state that callers can test for.
  - It supports view and `_all_docs` queries.
  - It supports regular changes queries and long-poll changes queries.
  - It doesn't have any weird ORM-like behavior or caching. Documents are just
    plain old javascript objects. Revs don't get updated on documents you pass
    in.
  - It doesn't implement the whole CouchDB API, but it has a generic method adequate
    for interacting with any CouchDB URL that expects JSON as input and produces
    JSON as output.
    
# Installing #

    npm install cot

# Examples #

Here's a silly example that creates a new document and then updates it:

    var Cot = require('cot');
    var db = new Cot({hostname: 'localhost', port: 5984}).db('my-db');
    
    var doc = {
        title: 'So yeah, Cot is definitely another CouchDB library'
    };
    
    db.post(doc)
    .then(function(response) {
        doc._id = response.id;
        doc._rev = response.rev;
        doc.update = 'Time to update this document and save it again!';
        return db.post(doc);
    })
    .then(function(response) {
        // let's print out the rev because that would be cool
        console.log(response.rev);
    })
    .fail(function(err) {
        // if anything goes wrong, we'll end up here
        console.log('errors are lame in examples');
    });


Here's an example that increments a counter and is aware of conflicts:

    function incrementCounter(docId) {
        return db.get(docId)
        .then(function(doc) {
            doc.counter += 1;
            return db.put(doc);
        })
        .then(function(response) {
            if (response.ok) {
                return response;
            } else {
                // there was a conflict... try again
                return incrementCounter(docId);
            }
        })
    }

This pattern is very common in CouchDB, so Cot comes with a quicker way to do it:

    function incrementCounter(docId) {
        return db.update(docId, function(doc) {
            doc.counter += 1;
            return doc;
        });
    }
    

# API Reference #

## cot = new Cot(opts) ##

`opts` must contain the following keys:

  - `port`: the port number of your couchdb server
  - `hostname`: the hostname of your couchdb server

`opts` may contain the following keys:

  - `ssl`: if set to true, Cot will use https
  - `auth`: may be set to a string in the format 'username:password' for basic auth

## db = cot.db(dbName) ##

Returns an object representing the specified database.


## promise = db.info() ##

`GET /<dbName>`


## promise = db.get(docId)

`GET /<dbName>/<docId>`

Missing documents are treated as an error.


## promise = db.exists(docId)

`GET /<dbName>/<docId>`

Returns whole document if docId exists and null if docId is missing


## promise = db.post(doc)

`POST /<dbName>`

Creates a new document or updates an existing document. If `doc._id` is undefined, CouchDB will
generate a new ID for you.

On 201, returns result from CouchDB which looks like: `{"ok":true, "id":"<docId>", "rev":"<docRev>"}`

All other status codes (including 409, conflict) are treated as errors


## promise = db.put(doc)

`PUT /<dbName>/<doc._id>`

On 409 (conflict) returns result from CouchDB which looks like: `{"error":"conflict"}`

On 201, returns result from CouchDB which looks like: `{"ok":true, "id":"<docId>", "rev":"<docRev>"}`

All other status codes are treated as errors.


## promise = db.batch(doc)

`POST /<dbName>?batch=ok`

Creates or updates a document but doesn't wait for success. Conflicts will not be detected.

On 202, returns result from CouchDB which looks like: `{"ok":true, "id":"<docId>"}`

The rev isn't returned because CouchDB returns before checking for conflicts. If there is a conflict,
the update will be silently lost.

All other status codes are treated as errors.


## promise = db.delete(docId, rev)

`DELETE /<dbName>/<docId>?rev=<rev>`

On 200, returns result from CouchDB which looks like: `{"ok":true, "id":"<docId>", "rev":"<docRev>"}`

All othe status codes are treated as errors.

If you wish to gracefully handle update conflicts while deleting, use `db.put()` on a document with
`_deleted` set to `true`:

    doc._deleted = true;
    db.put(doc).then(function(response) {
        if (!response.ok) {
            // there was a conflict
        }
    });


## promise = db.update(docId, updateFunction)

Gets the specified document, passes it to `updateFunction`, and then saves the results of `updateFunction`
over the document

The process loops if there is an update conflict.

If `updateFunction` needs to do asynchronous work, it may return a promise.


## promise = db.bulk(arrayOfDocs)

`POST /<dbName>/_bulk_docs`

See CouchDB documentation for more information


## promise = db.view(designName, viewName, query)

`GET /<dbName>/_desgin/<designName>/_view/<viewName>?<properly encoded query>`

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

For more information, refer to http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options


## promise = db.allDocs(query)

`GET /<dbName>/_all_docs?<properly encoded query>`

Queries the `_all_docs` view. `query` supports the same keys as in `db.view`.


## promise = db.viewKeys(designName, viewName, keys)

Queries the specified keys from the specified view. Keys should be an array of keys.


## promise = db.allDocsKeys(keys)

Loads documents with the specified keys.


## promise = db.changes(query)

Queries the changes feed given the specified query. `query` may contain the following keys:

  - `filter`: filter function to use
  - `include_docs`: if true, results will contain entire document
  - `limit`: the maximum number of change rows this query should return
  - `since`: results will start immediately after the sequence number provided here
  - `longpoll`: if true, query will send feed=longpoll
  - `timeout`: timeout in milliseconds for logpoll queries

For more information about the CouchDB changes feed, see http://wiki.apache.org/couchdb/HTTP_database_API#Changes

