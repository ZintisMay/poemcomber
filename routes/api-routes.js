/* Api routes 
 * ========== */

 // require express
var jwt = require('jsonwebtoken');
// require sequelize
var sequelize = require('../config/connection.js');
// require file seeker
var fs = require('fs');
//require path
var path = require('path');

// require the models
var Users = require('../model/user.js');
var Comments = require('../model/comments.js');
var Assignments = require('../model/assignments.js');


// Define functions that the API will use

// poemConvert:  takes poem data and uses regex 
// to add proper element tags and class names "</span></p><br /><p><span>");
function poemConvert(excerpt) {

	// replace all instances of double-line breaks with <br />\n
	excerpt = excerpt.replace(/\n{2,}/g, function(match) {

		// count occurrences of \n
		var occurrences = match.match(/\n/g).length;

		// substract one from occurrences to get number of <br /> tags
		var brs = "";
		for (var i = 0; i < (occurrences - 1); i++) {
			brs += "<br />";
		}

		// construct the string
		var replacement = "</span></p>" + brs + "<p><span>";

		// return it
		return replacement;
	})

	// replace all instances of line breaks with </p><p>
	excerpt = excerpt.replace(/\n/g, "</span></p><p><span>");

	// add p tags to beginning and end of excerpts
	excerpt = "<div id='poemBody'><p><span>" + excerpt + "</span></p></div>";

	// add data-lines to each p-tag, with help from incrementing i
	var i = 1;

	// replace every p-tag with one that has the class and datalines we need
	excerpt = excerpt.replace(/<p>/g, function(match){
		replacement = "<p class='poemLine' data-line='" + i + "'>";
		
		// increment i for the next line
		i++;

		// return the replacement
		return replacement;
	})
	
	// and return the excerpt
	return excerpt;
}

/* -/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/
    FOR EVERY USER API ROUTE, MAKE SURE YOU USE req.decoded
 * -/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/
 This is the decoded cookie retrieved in auth-routes */

module.exports = function(app) {

	// test route for debug
	// =====================
	app.get('/api/test', function(req, res) {
		res.json(req.decoded);
	})

	/* IMPORTANT API ROUTES START HERE */

// 1. Work with data from instructor's poem submission
//     - /postpoem
// =================================================== 
	app.post('/api/postpoem', function(req, res){
		
		// get the user info from the cookie
		var user = req.decoded;

		// grab the poem data from the ajax post
		poem = req.body;

		// save filename from title of poem
		var filename = poem.title;

		// make container to put filedir into (to be saved to db)
		var filedir = "";

		// make a function for saving the info into the database
		function poemMaker(theRoute) {

			// first, add the assignment
			Assignments.create({
				textfileroute: theRoute, // function parameter
				title: poem.title,
				summary: poem.summary,
				author: poem.author,
				instructor: user.username // instructor's name
			}).then(function(){
				// next, update the instructors (updatedAt)
				Users.update({
					updatedAt: new Date()
				},{
					where: {id : user.id}
				})
			}).catch(function(err){ // catch errors
				console.log(err);
				if (err) throw err;
			})
		}

		// This next part writes the file, 
		// and has an error check for duplicate files.

		/* IMPORTANT /-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/
		 * 
		 * This gets funky since fs.exists is deprecated.
		 * To check if a file already exists with the filename 
		 * we want to write with, we need to call fs.stat(), which
		 * normally grabs a file and shoots back some stats about it.
		 * If we encounter an error, that's actually desirable (say whaaaaat).
		 *                        
		 * Okay, so if the error code is ENOENT, then no file exists  
		 * with our filename. Otherwise, the error is an actual problem. 
		 * On the flip side, if we get no error, then we found a duplicate.
		 * In that case, we need to add (1), or (2), etc (like an OS does). 
		 *
		 * In essence, we have to rely on the function encountering an error
		 * in order to check for duplicates. -Steve
		 * -/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/-/ */
		fs.stat(path.join(__dirname + "/../poems/" + filename + ".txt"), function(err, stats){
			// if it has a duplicate filename
			if(err == null) {
				// log that we found a duplicate
				console.log("File found with the filename" + filename +"!\n" +
										"Attempting new filename(s)");
				
				// make a while to check for nums
				var counter = false;
				var i = 0; 
				while(!counter) {
					i++;
					// try looking for another file, using the value of i
					try {
						// synchronous fs.statSync to work within confines of while loop
						var fileStats = fs.statSync(path.join(__dirname + "/../poems/" + filename + "(" + i + ").txt"));
						console.log("That's a file");
					// if that's not yet a file, it will give us ENOENT.
					// therefore we must "catch" the error and check
					// whether the code is ENOENT
					} catch(err) {
						if (err.code == 'ENOENT') {
							// then try this
							try {
								// synchronous write to work within confines of while loop
								fs.writeFileSync(path.join(__dirname + "/../poems/" + filename + "(" + i + ").txt"), poem.excerpt);
								// save filedir so we have the file for sql
								filedir = "/../poems/" + filename + "(" + i + ").txt";
								// create the entry in the database
								poemMaker(filedir);
								// log our success story
								console.log("We found a good name! File saved as " + filename + "(" + i + ").txt");
								// send ajax the success
								res.end("{'success' : 'Updated Successfully', 'status' : 200}");
								// switch the counter on
								counter = true;
							} catch(err) {
								// show us any errors with the writeFileSync
								throw err;
							}
						}
						else {
							// show us any errors with the fs.statSync 
							throw err;
						}
					}
				}
			}
			// BUT if we didn't find a duplicate
			else if(err.code == "ENOENT"){
				console.log("No File Found!");
				// write the file
				fs.writeFile(path.join(__dirname + "/../poems/" + filename + ".txt"), poem.excerpt, function(err){
					if (err) throw err;
					// save filedir so we have the file for sql
					filedir = "/../poems/" + filename + ".txt";
					// create the entry in the database
					poemMaker(filedir);
					// send ajax the success
					res.end("{'success' : 'Updated Successfully', 'status' : 200}");
				})
			}
			else {
				// log errors
				console.log("Error submitting file: " + err);
			}
		})
	})

// 2: load the poem on the comments page
// =====================================
	app.get("/api/comments/:id", function(req, res) {
		
		// poem id is from the url
		var poemID = req.params.id;
		
		// make the call for the poem info
    Assignments.findOne({
    	where: {
    		id: poemID
    	} // save poem info into a data object
    }).then(function(result){
    	data = result.dataValues;
    	
    	// try grabbing the file in the poem obj
    	try{
    		
    		// save the poem itself to the data we'll shoot back
    		data.poem = fs.readFileSync(path.join(__dirname + data.textfileroute), "utf-8");

    		// convert the poem into something with html element tags, data-lines and id
    		data.poem = poemConvert(data.poem); 
    	} // if we run into an error, throw it
    		catch(err) {
    		if (err) throw err;
    	}
    	// find all comments start and end lines
    	Comments.findAll({
    		where: {
    			foreignAssignment: poemID
    		},
    		attributes: ['startingLine', "endingLine"]
    	}).then(function(result){
    	data.comments = result
    		res.json(data);
    	})
		})
	})
// 3: Show comments when user click highlights
// ===========================================
	app.get("/api/comments/:id/grab/:line", function(req, res) {
		
		// first grab the number of the line clicked
		var clicked = req.params.line; 
		
		// then, grab assignment id from the url path
		var assignment = req.params.id
		
		// get the info from the relevant db's 
		var q1 = "SELECT * FROM comments INNER JOIN users ON comments.foreignUser = users.id ";
		var q2 = "WHERE comments.foreignAssignment = ? AND ? <= comments.endingLine AND ? >= comments.startingLine " +
							"ORDER BY comments.startingLine ASC, comments.endingLine ASC";
		var query = q1 + q2;
		
		// send the query
		sequelize.query(query,{ replacements: [assignment,clicked,clicked], type: sequelize.QueryTypes.SELECT }).then(function(result){

			// make a data obj with comments
			var data = {
				comments:[]
			}
			
			// for each row
			for(var i = 0 ; i < result.length ;i++){
				// fill a new object with this data
				var obj = {
					text: result[i].comment,
					commentDate: result[i].createdAt,
					user: result[i].username,
					startLine: result[i].startingLine,
					endLine: result[i].endingLine
				} // push this to the data array
				data.comments.push(obj);
			}
			// send the array
			res.json(data); 
		})
	});

//posts comment to database
app.post("/api/comments/:id/post",function(req,res){

	// save all of the info from the cookie, body, and url
	var user = req.decoded.id;
	var assignment = req.params.id;
  var startLine = req.body.startLine
  var endLine = req.body.endLine
  var comment = req.body.comment

  // use that data to create the comment
  Comments.create({
  	foreignAssignment:assignment,
  	foreignUser: user,
  	comment: comment,
  	startingLine: startLine,
  	endingLine: endLine
	})

  // send success
	res.status(200).end();
})

// show assignments on Professor page
	app.get("/api/professoroverview/assignments", function(req, res){
		// grab the instructor from the instructor's username in cookie
	  var instructor = req.decoded.username;
	  	// find the instructors assignments
    Assignments.findAll({
    	where: {
  			instructor: instructor
  		},
		}).then(function(result){ 
          res.json(result);
      })
  });

	// show student info on professor page
  app.get("/api/professoroverview/students", function(req, res){
		// grab the instructor from the instructor's username in cookie
    var instructor = req.decoded.username;
    // find all students
    Users.findAll({
        where:{
        	  role:"student",
        	  instructorName:instructor
        },
        order: 'username ASC'
    }).then(function(result){
        res.json(result);
    })
  });

  // get comments for particular student when click on by instructor
	app.post("/api/professoroverview/studentcomments", function(req, res){
		// These 2 lines create a join between assignments and comments
		Assignments.hasMany(Comments, {foreignKey: 'foreignAssignment'})
		Comments.belongsTo(Assignments, {foreignKey: 'foreignAssignment'})

		// this join allows us to grab comments, and all the assignment info
		// relevant to that comment
		Comments.findAll({
			where:{
				foreignUser: req.body.id
			},
			include: [Assignments]
		}).then(function(result) {
			res.json(result);
		})
	});

  // show assignments on student page
  app.get("/api/studentoverview/assignments", function(req, res){
  		// grab the instructor from the instructor's username in cookie
      var instructorName = req.decoded.instructorName;
      Assignments.findAll({
      	where:{
      		instructor:instructorName
      	}
      }).then(function(result){     
          res.json(result);
      })
  });
}
