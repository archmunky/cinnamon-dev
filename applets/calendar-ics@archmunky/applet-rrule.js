
const { ENETDOWN } = require('constants');
const fs = require('fs');
const ical = require('./ical.js');
const recur = require('./rrule.js');
const moment = require('./moment.js');


var events = [];

function GetEvents(addr) {
    return new Promise(function (resolve, reject) {
        fs.readFile(addr, 'utf8', function (err, data) {
            if (err)
                reject(err);
            else
                resolve(data);
        });
    });
}

function ParseEvents(icsData) {
    //import { RRule, RRuleSet, rrulestr } from './rrule.js';

    var start = new Date();
    start.setHours(0,0,0,0);

    var end = new Date();
    end.setDate(start.getDate() + 7);

    var rangeStart = moment(start);
	var rangeEnd = moment(end);

    var data = ical.parseICS(icsData);
    for (let k in data) {
        if (data.hasOwnProperty(k)) {
            var event = data[k];
            if (data[k].type == 'VEVENT') {
                
                var eventName = event.summary;
                var startDate = moment(event.start);
                var endDate = moment(event.end);

                // Calculate the duration of the event for use with recurring events.
		        var duration = parseInt(endDate.format("x")) - parseInt(startDate.format("x"));

                // Simple case - no recurrences, just print out the calendar event.
		        if (typeof event.rrule === 'undefined')
		        {
                    if (startDate >= rangeStart && startDate <= rangeEnd) {
                        events.push([startDate, eventName]);
                    }
                } else if (typeof event.rrule !== 'undefined') {
                    // Complicated case - if an RRULE exists, handle multiple recurrences of the event.

                    var dtstamp = "DTSTART:" + moment.utc(event.dtstamp).format("YYYYMMDDTHHmmss") + "Z\n" + event.rrule;

                    // console.log("event: " + event.summary);
                    // console.log("dtstamp: " + moment(event.dtstamp).format());
                    // console.log("rrule: " + event.rrule);
                    // console.log("dtstamp: " + dtstamp);
    
                    // For recurring events, get the set of event start dates that fall within the range of dates we're looking for.
                    var ruleset = recur.rrulestr(dtstamp);
                    //console.log(ruleset.all());
                    var dates = ruleset.between(start, end);
                    //var dates = rule.between(new Date(Date.UTC(2021, 10, 26)), new Date(Date.UTC(2021, 11, 2)));
                    //     rangeStart.toDate(),
                    //     rangeEnd.toDate()
                    // )
                    // console.log("event: " + event.summary);
                    // console.log("eventDate: " + event.start);
                    // console.log("eventrrule: " + event.rrule);
                    // console.log("start: " + start);
                    // console.log("end: " + end);
                    // // console.log("rangeStart: " + moment(rangeStart).format("MM Do YY h:mm a"));
                    // // console.log("rangeEnd: " + moment(rangeEnd).format("MM Do YY h:mm a"));
                    // console.log("dates: " + dates);
                    // console.log("-----------------------------------------");

                    // The "dates" array contains the set of dates within our desired date range range that are valid
                    // for the recurrence rule.  *However*, it's possible for us to have a specific recurrence that
                    // had its date changed from outside the range to inside the range.  One way to handle this is
                    // to add *all* recurrence override entries into the set of dates that we check, and then later
                    // filter out any recurrences that don't actually belong within our range.
                    if (event.recurrences != undefined)
                    {
                        for (var r in event.recurrences)
                        {
                            // Only add dates that weren't already in the range we added from the rrule so that 
                            // we don't double-add those events.
                            if (moment(new Date(r)).isBetween(rangeStart, rangeEnd) != true)
                            {
                                dates.push(new Date(r));
                            }
                        }
                    }
        
                    // Loop through the set of date entries to see which recurrences should be printed.
                    for(var i in dates) {
        
                        var date = dates[i];
                        var curEvent = event;
                        var showRecurrence = true;
                        var curDuration = duration;
        
                        startDate = moment(date);

                        // console.log("date: " + date);
                        // console.log("curEvent: " + curEvent);
                        // console.log("startDate: " + startDate);

                        // Use just the date of the recurrence to look up overrides and exceptions (i.e. chop off time information)
                        var dateLookupKey = date.toISOString().substring(0, 10);
        
                        // For each date that we're checking, it's possible that there is a recurrence override for that one day.
                        if ((curEvent.recurrences != undefined) && (curEvent.recurrences[dateLookupKey] != undefined))
                        {
                            // We found an override, so for this recurrence, use a potentially different title, start date, and duration.
                            curEvent = curEvent.recurrences[dateLookupKey];
                            startDate = moment(curEvent.start);
                            curDuration = parseInt(moment(curEvent.end).format("x")) - parseInt(startDate.format("x"));
                        }
                        // If there's no recurrence override, check for an exception date.  Exception dates represent exceptions to the rule.
                        else if ((curEvent.exdate != undefined) && (curEvent.exdate[dateLookupKey] != undefined))
                        {
                            // This date is an exception date, which means we should skip it in the recurrence pattern.
                            showRecurrence = false;
                        }
        
                        // Set the the title and the end date from either the regular event or the recurrence override.
                        var recurrenceTitle = curEvent.summary;
                        endDate = moment(parseInt(startDate.format("x")) + curDuration, 'x');
        
                        // If this recurrence ends before the start of the date range, or starts after the end of the date range, 
                        // don't process it.
                        if (endDate.isBefore(rangeStart) || startDate.isAfter(rangeEnd)) {
                            showRecurrence = false;
                        }
        
                        if (showRecurrence === true) {
                            let eventDate = new Date(startDate);
                            events.push([eventDate, recurrenceTitle]);

                            console.log('title:' + recurrenceTitle);
                            console.log('eventDate: ' + eventDate);
                            console.log('startDate:' + startDate.format('MMMM Do YYYY, h:mm:ss a'));
                            console.log('endDate:' + endDate.format('MMMM Do YYYY, h:mm:ss a'));
                            console.log('duration:' + moment.duration(curDuration).humanize());
                            console.log('--------------------------------------------------');
                        }
                    }    
                }
            } 

        }
    }
    events.sort(function(a,b) { return a[0]-b[0]});
}; // function ParseEvents

function PrintEvents() {
    console.log("***********************************************");
    for (let i = 0; i< events.length; i++) {
        var EventDate = new Date(events[i][0]);
        console.log(FormatDate(EventDate) + ": " + events[i][1]);
    }
}; // function PrintEvents

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
}; // function FormatDate

async function Update() {
    try {
        let data = await GetEvents('/home/munky/google-personal.ics');
        ParseEvents(data);
        PrintEvents();
    } catch (error) {
        console.error(error);
    }
}

Update();



        // // When dealing with calendar recurrences, you need a range of dates to query against,
        // // because otherwise you can get an infinite number of calendar events.
        // var rangeStart = new Date();
        // rangeStart.setHours(0,0,0,0);

        // var rangeEnd = new Date();
        // rangeEnd.setDate(rangeStart.getDate() + 7);

        // var events = [];
        // var data = ical.parseICS(data);
        // for (let k in data) {
        //     var event = data[k];
        //     if (data.hasOwnProperty(k)) {
        //         if (data[k].type == 'VEVENT') {

        //             var title = event.summary;
        //             var startDate = moment(event.start);
        //             var endDate = moment(event.end);

        //             // Calculate the duration of the event for use with recurring events.
        //             var duration = parseInt(endDate.format("x")) - parseInt(startDate.format("x"));
            
        //             // Simple case - no recurrences, just print out the calendar event.
        //             if (typeof event.rrule === 'undefined')
        //             {
        //                 console.log('title:' + title);
        //                 console.log('startDate:' + startDate.format('MMMM Do YYYY, h:mm:ss a'));
        //                 console.log('endDate:' + endDate.format('MMMM Do YYYY, h:mm:ss a'));
        //                 console.log('duration:' + moment.duration(duration).humanize());
        //                 console.log();
        //             }
        //         }
        //         // Complicated case - if an RRULE exists, handle multiple recurrences of the event.
        //         else if (typeof event.rrule !== 'undefined')
        //         {
        //             // For recurring events, get the set of event start dates that fall within the range
        //             // of dates we're looking for.
        //             var dates = event.rrule.between(
        //             rangeStart.toDate(),
        //             rangeEnd.toDate(),
        //             true,
        //             function(date, i) {return true;}
        //             )
        
        //             // The "dates" array contains the set of dates within our desired date range range that are valid
        //             // for the recurrence rule.  *However*, it's possible for us to have a specific recurrence that
        //             // had its date changed from outside the range to inside the range.  One way to handle this is
        //             // to add *all* recurrence override entries into the set of dates that we check, and then later
        //             // filter out any recurrences that don't actually belong within our range.
        //             if (event.recurrences != undefined)
        //             {
        //                 for (var r in event.recurrences)
        //                 {
        //                     // Only add dates that weren't already in the range we added from the rrule so that 
        //                     // we don't double-add those events.
        //                     if (moment(new Date(r)).isBetween(rangeStart, rangeEnd) != true)
        //                     {
        //                         dates.push(new Date(r));
        //                     }
        //                 }
        //             }
        
        //             // Loop through the set of date entries to see which recurrences should be printed.
        //             for(var i in dates) {
        
        //                 var date = dates[i];
        //                 var curEvent = event;
        //                 var showRecurrence = true;
        //                 var curDuration = duration;
        
        //                 startDate = moment(date);
        
        //                 // Use just the date of the recurrence to look up overrides and exceptions (i.e. chop off time information)
        //                 var dateLookupKey = date.toISOString().substring(0, 10);
        
        //                 // For each date that we're checking, it's possible that there is a recurrence override for that one day.
        //                 if ((curEvent.recurrences != undefined) && (curEvent.recurrences[dateLookupKey] != undefined))
        //                 {
        //                     // We found an override, so for this recurrence, use a potentially different title, start date, and duration.
        //                     curEvent = curEvent.recurrences[dateLookupKey];
        //                     startDate = moment(curEvent.start);
        //                     curDuration = parseInt(moment(curEvent.end).format("x")) - parseInt(startDate.format("x"));
        //                 }
        //                 // If there's no recurrence override, check for an exception date.  Exception dates represent exceptions to the rule.
        //                 else if ((curEvent.exdate != undefined) && (curEvent.exdate[dateLookupKey] != undefined))
        //                 {
        //                     // This date is an exception date, which means we should skip it in the recurrence pattern.
        //                     showRecurrence = false;
        //                 }
        
        //                 // Set the the title and the end date from either the regular event or the recurrence override.
        //                 var recurrenceTitle = curEvent.summary;
        //                 endDate = moment(parseInt(startDate.format("x")) + curDuration, 'x');
        
        //                 // If this recurrence ends before the start of the date range, or starts after the end of the date range, 
        //                 // don't process it.
        //                 if (endDate.isBefore(rangeStart) || startDate.isAfter(rangeEnd)) {
        //                     showRecurrence = false;
        //                 }
        
        //                 if (showRecurrence === true) {
        
        //                     console.log('title:' + recurrenceTitle);
        //                     console.log('startDate:' + startDate.format('MMMM Do YYYY, h:mm:ss a'));
        //                     console.log('endDate:' + endDate.format('MMMM Do YYYY, h:mm:ss a'));
        //                     console.log('duration:' + moment.duration(curDuration).humanize());
        //                     console.log();
        //                 }
        
        //             }
        //         } 

        //             //events.push([eventDateJulian, eventName]);
        //     }
        // }
//     }
// };

