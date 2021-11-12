const express = require('express')
const app = express()
const watch = require('node-watch');
const wget = require("wget-improved");
const port = 3000
const ref_server = "http://localhost:1880";

app.use('/', express.static('.'));
app.use(function(req,res,next){
  //this goes and downloads missing files from a reference instance of NR
  if(res.status(404)){
    var path = req._parsedUrl.pathname;
    console.log("missing file: ", path);
    var source = ref_server + path;
    var dest = "." + path;
    console.log("downloading file: ", source);
    wget.download(source, dest).on('error', function(err) {
      console.log(err);
    });
  }
});


app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})