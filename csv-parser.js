const fs = require('fs');
const parse = require('csv-parse');
const { Observable } = require('rxjs');
const { Writable } = require('stream');
const transform = require('stream-transform');

function getParser(path, csv_options) {
    return function () {
        return Observable.create(function (observer) {
            let rs = fs.createReadStream(path);
            let parser = parse(csv_options);
            let dispose = false;
            var transformer = transform(function (record, callback) {
                if (!dispose) {
                    observer.next(record);
                    callback(null, "");
                }
                else {
                    console.log("Disposing CSV stream !!");
                    rs.close();
                }
            }, { parallel: 10 });

            const outStream = new Writable({
                write(chunk, encoding, callback) {
                    callback();
                }
            });

            outStream.on('finish', () => {
                observer.complete();
            });

            rs.pipe(parser).pipe(transformer).pipe(outStream);

            return () => {
                dispose = true;
            };
        });
    };
}


module.exports = {
    getParser: getParser
};