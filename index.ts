import { BskyAgent, FollowRecord } from '@atproto/api';
import * as dotenv from 'dotenv';
import { CronJob } from 'cron';
import * as process from 'process';
import { cursorTo } from 'readline';
dotenv.config();

//BE SURE TO CREATE THE FOLLOWING ENVIRONMENT VARIABLES ON YOUR SYSTEM OR THIS WON'T WORK.
var username = process.env.BLUESKY_USER ?? ""; //ex: testuser.bsky.social
var pw = process.env.BLUESKY_PW ?? ""; //ex: myStrongPassword15%%

//DONT GET LOST IN THE OCEAN!
//UNFOLLOW ANYONE WHO'S FOLLOWING TOO MANY PEOPLE
//THEY WON'T SEE YOUR POSTS ANYWAY
var _MaxFollowing = 5000;

//DON'T FOLLOW PEOPLE WHO HAVEN'T POSTED YET.
//DON'T WORRY. IF THEY KEEP POSTING, WE'LL FOLLOW THEM LATER
var _MinPosts = 25;

//SET THIS TO TRUE IF YOU DON'T WANT TO AUTOMATICALLY POST TO YOUR PROFILE
var silentMode = true;

// Create a Bluesky Agent 
const agent = new BskyAgent({
    service: 'https://bsky.social',
  })


async function getFollowers(inCursor: string)
{    
    //returns a list of all your current followers.
    var followerRequest = await agent.getFollowers({actor: username, limit: 100, cursor : inCursor});
    var l_followers = followerRequest.data.followers;

    if(followerRequest.data.cursor != null)
    {
        var newFollowers = await getFollowers(followerRequest.data.cursor);
        l_followers = [ ...l_followers, ...newFollowers];
    }
    return l_followers;
}

async function getFollows(inCursor: string)
{    
    //returns a list of everyone you currently follow.
    var followRequest = await agent.getFollows({actor: username, limit: 100, cursor : inCursor});

    var l_follows = followRequest.data.follows;

    if(followRequest.data.cursor != null)
    {
        var newFollows = await getFollows(followRequest.data.cursor);
        l_follows = [ ...l_follows, ...newFollows];
    }
    return l_follows;
}

async function main() {
    //output variables for logging
    console.log("USER VARIABLES");
    console.log("\tUser: " + username);
    console.log("\tMax Following: " + _MaxFollowing);
    console.log("\tMin Posts: " + _MinPosts);
    console.log("\tSilent Mode: " + silentMode);

    //login first
    console.log("\nLogging in...")
    await agent.login({identifier : username, password: pw});
    var userDID = (await agent.getProfile({actor: username})).data.did;

    //get a list of followers
   console.log("\nGetting followers...");
   var followers = await getFollowers("");
   console.log("\t"+followers.length + " Followers Found.");

    //get current follows
    console.log("\nGetting Follows...");
    var follows = await getFollows("")
    console.log("\t"+follows.length + " Follows Found.");
    
    //create a list of just the DIDs for compare
    console.log("\nLooping through follows to find newbies...");
    console.log("Deleting people with too many follows while we're in this loop...");
    var followsDids: string[] = [];
    var unfollows = 0;
    for(var i = 0; i<follows.length; i++)
    {   
        //while we're here, let's unfollow anyone who has too many followers. (as set by _MaxFollowing)        
        var userProfile = await agent.getProfile({actor: follows[i].did});
        var followsCount = userProfile.data.followsCount ?? 0;
        if (followsCount >= _MaxFollowing)
        {
            console.log("\tUNFOLLOWING: " + follows[i].handle + " for following " + followsCount + " people.");
            //we have to call the Follow API again to get the URI.
            var userURI = userProfile.data.viewer?.following ?? "";
            await agent.deleteFollow(userURI);
            unfollows++;
            continue;
        }

        //also check if they just haven't posted enough (As set by _MinPosts)
        var postsCount = userProfile.data.postsCount ?? 0
        if(postsCount < _MinPosts)
        {
            console.log("\tUNFOLLOWING: " + follows[i].handle + " because the've only made " + postsCount + " post(s).");
            //we have to call the Follow API again to get the URI.
            var userURI = userProfile.data.viewer?.following ?? "";
            await agent.deleteFollow(userURI);
            unfollows++;
            continue;
        }
        followsDids.push(follows[i].did);
    }
    console.log("UNFOLLOWED: " + unfollows + " user(s) for following " + _MaxFollowing + " or more people.");
    console.log("\nFOLLWING BACK...");

    var newFollows = 0;
    var skippedFollows = 0;
    for(var i = 0; i<followers.length; i++ )
        {
            var userProfile = await agent.getProfile({actor: followers[i].did});
            if (userProfile == null)
            {
                console.log("\tNULL PROFILE RETURNED. CONTINUING");
                continue;
            }
            var followsCount = userProfile.data.followsCount ?? 0;
            var postsCount = userProfile.data.postsCount ?? 0;
            //make sure they're not following too many people
            if (followsCount >= _MaxFollowing)
            {
                console.log("\tSKIPPED FOLLOWBACK FOR: " +followers[i].handle + " for following " + followsCount + " people" );
                skippedFollows++;
                continue;
            }

            //make sure they've posted enough times
            if (postsCount < _MinPosts)
                {
                    console.log("\tSKIPPED FOLLOWBACK FOR: " +followers[i].handle + " because they've only made " + postsCount + " posts." );
                    skippedFollows++;
                    continue;
                }

            //follow them back
            if (followsDids.indexOf(followers[i].did) == -1)
            {
                console.log("\tFOLLOWING BACK: " + followers[i].handle);
                await agent.follow(followers[i].did);
                newFollows++;
            }
        }    
        console.log("FOLLOWED BACK: " + newFollows + " unreciprocated users.");


    //post that I autmatically followed people
    if (newFollows > 0 && !silentMode)
    {
        console.log("\nPosting follows...");
        await agent.post({
            text: "@followbackgrl.bsky.social just automatically followed back "+ newFollows +" follower(s) for me.",
            facets: [
                {
                    index: {
                        byteStart: 0,
                        byteEnd: 14
                    },
                    features: [{
                        $type: 'app.bsky.richtext.facet#mention',
                        did: 'did:plc:lsjqcjmyp5mzn7ba7frmh67m'
                    }]
                }
            ]            
        });        
        console.log("\tPosted.")
    } else {
        var postNotification = "\n";
        if (silentMode) postNotification += "Silent Mode. ";
        postNotification += "Nothing to post.";
        console.log(postNotification);
    }

    //post that I autmatically unfollowed people
    if (unfollows > 0 && !silentMode)
    {
        console.log("\nPosting unfollows...");
        await agent.post({
            text: "@followbackgrl just automatically unfollowed " + unfollows + " user(s) for exceeding my " + _MaxFollowing + " follower limit.",
            facets: [
                {
                    index: {
                        byteStart: 0,
                        byteEnd: 14
                    },
                    features: [{
                        $type: 'app.bsky.richtext.facet#mention',
                        did: 'did:plc:lsjqcjmyp5mzn7ba7frmh67m'
                    }]
                }
            ]            
        });        
        console.log("\tPosted.")
    } else {
        var postNotification = "\n";
        if (silentMode) postNotification += "Silent Mode. ";
        postNotification += "Nothing to post.";
        console.log(postNotification);
    }

    //Now make FollowBackGrl post about it regardless of silent mode.
    console.log("\nLogging in as FollowBackGrl...")
    await agent.login({identifier : "followbackgrl.bsky.social", password: pw});

    console.log("\tPosting user report...") 
    await agent.post({
            text: "User Report:\n"+
            "\{\n"+
            "\tUser: "+username+"\n"+
            "\tMax Follows: "+_MaxFollowing+"\n"+
            "\tMin Posts: "+_MinPosts+"\n"+            
            "\tUnfollowed: "+unfollows+"\n"+
            "\tFollowed Back: "+newFollows+"\n"+
            "\tSkipped Followbacks: "+skippedFollows+"\n"+
            "\}"+
            "\n"+
            "This user has decided not to follow anyone with more than " + _MaxFollowing + " follows or fewer than " + _MinPosts + " posts.",
            facets: [
                {
                    index: {
                        byteStart: 22,
                        byteEnd: username.length + 22
                    },
                    features: [{
                        $type: 'app.bsky.richtext.facet#mention',
                        did: userDID
                    }]
                }
            ]        
    });
    console.log("\tPosted.")
    
}

main();


//Run this on a cron job
const scheduleExpression = '0 */1 * * *'; // Run once every hour
const job = new CronJob(scheduleExpression, main);

job.start();