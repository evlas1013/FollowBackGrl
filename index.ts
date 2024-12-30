import { BskyAgent, FollowRecord } from '@atproto/api';
import * as dotenv from 'dotenv';
import { CronJob } from 'cron';
import * as process from 'process';
import { cursorTo } from 'readline';
dotenv.config();

//BE SURE TO CREATE THE FOLLOWING ENVIRONMENT VARIABLES ON YOUR SYSTEM OR THIS WON'T WORK.
var username = process.env.BLUESKY_USER ?? ""; //ex: testuser.bsky.social
var pw = process.env.BLUESKY_PW ?? ""; //ex: myStrongPassword15%%

var greatestFollows = 0;
var greatestFollowsUser = "";

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
    var followerRequest;
    //returns a list of all your current followers.
    if (inCursor == "")
    {
        followerRequest = await agent.getFollowers({actor: username, limit: 100});
    } else {
        followerRequest = await agent.getFollowers({actor: username, limit: 100, cursor : inCursor});
    }
    
    var l_followers = followerRequest.data.followers;

    if(followerRequest.data.cursor != "" && followerRequest.data.cursor != null)
    {
        var newFollowers = await getFollowers(followerRequest.data.cursor);
        l_followers = [ ...l_followers, ...newFollowers];
    }
    return l_followers;
}

async function getFollows(inCursor: string)
{    
    //returns a list of everyone you currently follow.
    var followRequest;
    if (inCursor == "")
        {
            followRequest = await agent.getFollows({actor: username, limit: 100});
        } else {
            followRequest = await agent.getFollows({actor: username, limit: 100, cursor : inCursor});
        }

    var l_follows = followRequest.data.follows;

    if(followRequest.data.cursor != "" && followRequest.data.cursor != null)
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
    console.log("\nLogged in as " + username);

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
    var blocks = 0;    
    for(var i = 0; i<follows.length; i++)
    {   
        //while we're here, let's block anyone who has too many followers. (as set by _MaxFollowing)        
        var userProfile = await agent.getProfile({actor: follows[i].did});
        var followsCount = userProfile.data.followsCount ?? 0;

        //just for fun, let's keep track of who follows the most people. Some of these are outrageous...
        if (followsCount > greatestFollows)
        {
            greatestFollows = followsCount;
            greatestFollowsUser = userProfile.data.handle;
            console.log("\tNEW WINNER FOUND!!! " + userProfile.data.handle + "-" + followsCount);
        }
        if (followsCount >= _MaxFollowing)
        {            
            
            console.log("\tBLOCKING: " + follows[i].handle + " for following " + followsCount + " people.");
            await agent.app.bsky.graph.block.create(
                {repo: userDID},
                {
                    subject: follows[i].did,
                    createdAt: new Date().toISOString()
                }
            )
            blocks++;
            continue;
        }

        //also check if they just haven't posted enough (As set by _MinPosts)
        var postsCount = userProfile.data.postsCount ?? 0
        if(postsCount < _MinPosts)
        {
            var userURI = userProfile.data.viewer?.following ?? "";
            if(userURI != "")
            {
                console.log("\tUNFOLLOWING: " + follows[i].handle + " because the've only made " + postsCount + " post(s).");                
                await agent.deleteFollow(userURI);
                unfollows++;
            } else {
                console.log("\tUNABLE TO FIND UNFOLLOW URI FOR: " + follows[i].handle);
            }
            continue;
        }
        //go ahead and follow them back
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

            if (followsCount > greatestFollows)
            {
                greatestFollows = followsCount;
                greatestFollowsUser = userProfile.data.handle;
                console.log("\tNEW WINNER FOUND!!! " + userProfile.data.handle + "-" + followsCount);
            }

            if (followsCount >= _MaxFollowing)
            {
                console.log("\tBLOCKING: " + followers[i].handle + " for following " + followsCount + " people.");
                await agent.app.bsky.graph.block.create(
                {repo: userDID},
                {
                    subject: followers[i].did,
                    createdAt: new Date().toISOString()
                }
                )
                blocks++;
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
            text: "@followbackgrl just automatically unfollowed " + unfollows + " user(s) for exceeding my " + _MaxFollowing + " follower limit or not posting at least " + _MinPosts + " original thoughts.",
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
    console.log("\nLogging in as FollowBackGrl...");
    await agent.login({identifier : "followbackgrl.bsky.social", password: pw});

    console.log("\tPosting user report...") 
    await agent.post({
            text: "User Report:\n"+
            "\{\n"+
            "\tUser: "+username+"\n"+
            "\tMax Follows: "+_MaxFollowing+"\n"+
            "\tMin Posts: "+_MinPosts+"\n"+           
            "\tUnfollowed: "+unfollows+"\n"+
            "\tBlocked: "+blocks+"\n"+
            "\tFollowed Back: "+newFollows+"\n"+
            "\tSkipped Followbacks: "+skippedFollows+"\n"+
            "\tMost Follows: " + greatestFollowsUser + " (" + greatestFollows + ")\n"+
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
    console.log("\tPosted.");
    console.log("Waiting until 17:00....");
    
}

main();


//Run this on a cron job
const scheduleExpression = '0 17 * * *'; // Run every day at 5pm
const job = new CronJob(scheduleExpression, main);

job.start();