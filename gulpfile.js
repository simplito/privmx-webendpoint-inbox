var gulp = require("gulp");
var browserify = require("browserify");
var gutil = require("gulp-util");
var tap = require("gulp-tap");
var connect = require("gulp-connect");
var watch = require("gulp-watch");
var ts = require("gulp-typescript");
var source = require("vinyl-source-stream");
var rimraf = require("gulp-rimraf");
var batch = require("gulp-batch");
var gulpTypings = require("gulp-typings");
 
gulp.task("typings", function() {
    var stream = gulp.src("./typings.json")
        .pipe(gulpTypings());
    return stream;
});

gulp.task("ts2js", function() {
    gutil.log("ts2js");
    var tsProject = ts.createProject("tsconfig.json");
    
    return gulp.src([
        "src/rpc/**.ts",
        "typings/index.d.ts",
        "custom-typings/**.d.ts"
    ])
    .pipe(ts(tsProject))
    .js.pipe(gulp.dest("dist/rpc"));
});

gulp.task("clean", function() {
    return gulp.src("./dist")
        .pipe(rimraf());
});

gulp.task("copy-js", function() {
    gutil.log("copy-js");
    return gulp.src("./src/**/*.js")
        .pipe(gulp.dest("./dist"));
});

gulp.task("copy-d.ts", function() {
    gutil.log("copy-d.ts");
    return gulp.src("./src/**/*.d.ts")
        .pipe(gulp.dest("./dist"));
})

gulp.task("generate", ["copy-js", "copy-d.ts", "ts2js"], function() {
    gutil.log("generate");
})

gulp.task("watch", function() {
    gulp.watch("src/**/*.*", ["generate"]);
})

gulp.task("default", ["generate"]);