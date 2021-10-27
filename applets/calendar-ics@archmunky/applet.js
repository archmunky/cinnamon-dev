function GetCalendarEvents() {

    const fs = require('fs');
    const ical = require('./ical.js');

    fs.readFile('/home/munky/google-personal.ics', 'utf8' , (err, data) => {
        if (err) {
            console.error(err)
            return
        }
        var events = [];
        var data = ical.parseICS(data);
        for (let k in data) {
            if (data.hasOwnProperty(k)) {
                var ev = data[k];
                if (data[k].type == 'VEVENT') {
                    var eventName = ev.summary;
                    var eventDateJulian = Date.parse(ev.start);
                    events.push([eventDateJulian, eventName]);
                }
            }
        }

        events.sort(function(a,b) { return a[0]-b[0]});

        var start = new Date();
        start.setHours(0,0,0,0);
    
        var end = new Date();
        end.setDate(start.getDate() + 7);
    
        let numEvents = events.length;
        for (let i = 0; i< numEvents; i++) {
            if (events[i][0] >= start && events[i][0] <= end) {
                var EventDate = new Date(events[i][0]);
                //console.log(ReadableDate.toLocaleString(undefined, {year: 'numeric', month: '2-digit', day: '2-digit', weekday:"short", hour: '2-digit', hour12: false, minute:'2-digit', second:'2-digit'}) + ": " + events[i][1]);
                //console.log(ReadableDate.toString() + ": " + events[i][1]);
                console.log(FormatDate(EventDate) + ": " + events[i][1]);
                //console.table(events[i]);
            }
        }

    })
};

// function ReadFile(filename) {
//     var contents = fs.readFileSync(filename)
//     return contents;
// }; // function ReadFile


function FormatDate(datestamp) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    var srcDate = new Date(datestamp);
    let dayOfWeek = days[srcDate.getDay()];
    var month = months[srcDate.getMonth()];
    var day = srcDate.getDate();
    var year = srcDate.getFullYear();
    var hours = srcDate.getHours();
    if (hours < 10) { hours = "0" + hours; }
    var minutes = srcDate.getMinutes();
    if (minutes < 10) { minutes = "0" + minutes; }

    return(dayOfWeek + " " + month + " " + day + " " + year + " " + hours + ":" + minutes);
}


GetCalendarEvents();

