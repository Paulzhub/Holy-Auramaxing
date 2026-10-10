-- gamification: levels (CLAUDE.md §7.6) and late offline check-ins (§7.5).
-- See D-064 to D-067.
--
-- The level engine replays every day from the day the account started, in
-- date order, exactly like data/build_levels.py `replay` (the reference):
--
--   clean    +1 progress; a full bar moves up one level (5 days a level up
--            to Level 20, then 10)
--   slipped  RELAPSE_LEVEL_PENALTY (10) levels off, never below 0; bar empties
--   missed   a day without a check-in whose window has closed (yesterday
--            closes at 12:00 local time): exactly the same as a slip (owner,
--            2026-10-10, D-063). Still shown as "No check-in", never as a slip.
--   paused   a missed day whose window closed while the account was closing
--            for deletion: costs nothing (owner, 2026-10-10)
--
-- user_stats keeps the result as of the last check-in. Missed days after it
-- are applied when the level is read (private.live_level), like the live
-- streaks (D-043), so the level is right even for someone who never opens
-- the app again, without a nightly job.

-- ---------------------------------------------------------------- config

create table private.app_config (
  key text primary key,
  value integer not null,
  description text not null
);

comment on table private.app_config is
  'Tunable whole-number settings the database enforces (D-064). Change with a migration.';

insert into private.app_config (key, value, description) values
  ('relapse_level_penalty', 10, 'Levels lost for a reported slip or a missed day (§7.6, RELAPSE_LEVEL_PENALTY).'),
  ('offline_sync_max_days', 7, 'How long after it was made an offline check-in is still accepted (§7.5, owner 2026-10-10).');

create or replace function util.config_int(p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select value from private.app_config where key = p_key;
$$;

revoke all on function util.config_int(text) from public, anon;
grant execute on function util.config_int(text) to authenticated, service_role;

-- ---------------------------------------------------------------- tiers and labels

create table public.level_tiers (
  tier integer primary key check (tier >= 0),
  era text not null,
  name text not null unique,
  reference text not null,
  -- World English Bible (public domain), checked against ebible.org (D-065).
  verse_text text not null
);

comment on table public.level_tiers is
  'Level names (§7.6), seeded from data/levels.json and data/level_verses.json. Tier 0 is Level 0 ("Clay"); each later tier covers six levels.';

alter table public.level_tiers enable row level security;
create policy "level_tiers: read" on public.level_tiers for select to authenticated using (true);
create policy "level_tiers: live, verified session" on public.level_tiers
  as restrictive for all to authenticated
  using ((select util.session_ok())) with check ((select util.session_ok()));
revoke all on public.level_tiers from anon, authenticated;
grant select on public.level_tiers to authenticated;

insert into public.level_tiers (tier, era, name, reference, verse_text) values
  (0, 'Beginning', 'Clay', 'Isaiah 64:8', 'But now, Yahweh, you are our Father. We are the clay and you our potter. We all are the work of your hand.'),
  (1, 'Genesis', 'Breath of Life', 'Genesis 2:7', 'Yahweh God formed man from the dust of the ground, and breathed into his nostrils the breath of life; and man became a living soul.'),
  (2, 'Genesis', 'Ark Builder', 'Genesis 6:14', 'Make a ship of gopher wood. You shall make rooms in the ship, and shall seal it inside and outside with pitch.'),
  (3, 'Genesis', 'Dove Sender', 'Genesis 8:8', 'He himself sent out a dove to see if the waters were abated from the surface of the ground,'),
  (4, 'Genesis', 'Rainbow Promise', 'Genesis 9:13', 'I set my rainbow in the cloud, and it will be a sign of a covenant between me and the earth.'),
  (5, 'Genesis', 'Pilgrim', 'Genesis 12:1', 'Now Yahweh said to Abram, “Leave your country, and your relatives, and your father’s house, and go to the land that I will show you.'),
  (6, 'Genesis', 'Star Counter', 'Genesis 15:5', 'Yahweh brought him outside, and said, “Look now toward the sky, and count the stars, if you are able to count them.” He said to Abram, “So your offspring will be.”'),
  (7, 'Genesis', 'Well Digger', 'Genesis 26:18', 'Isaac dug again the wells of water, which they had dug in the days of Abraham his father, for the Philistines had stopped them after the death of Abraham. He called their names after the names by which his father had called them.'),
  (8, 'Genesis', 'Ladder Dreamer', 'Genesis 28:12', 'He dreamed and saw a stairway set upon the earth, and its top reached to heaven. Behold, the angels of God were ascending and descending on it.'),
  (9, 'Genesis', 'Wrestler', 'Genesis 32:24', 'Jacob was left alone, and wrestled with a man there until the breaking of the day.'),
  (10, 'Genesis', 'Coat of Many Colors', 'Genesis 37:3', 'Now Israel loved Joseph more than all his children, because he was the son of his old age, and he made him a tunic of many colors.'),
  (11, 'Genesis', 'Temptation Dodger', 'Genesis 39:12', 'She caught him by his garment, saying, “Lie with me!” He left his garment in her hand, and ran outside.'),
  (12, 'Genesis', 'Palace Riser', 'Genesis 41:41', 'Pharaoh said to Joseph, “Behold, I have set you over all the land of Egypt.”'),
  (13, 'Exodus & Wilderness', 'Reed Basket', 'Exodus 2:3', 'When she could no longer hide him, she took a papyrus basket for him, and coated it with tar and with pitch. She put the child in it, and laid it in the reeds by the river’s bank.'),
  (14, 'Exodus & Wilderness', 'Holy Ground', 'Exodus 3:5', 'He said, “Don’t come close. Take off your sandals, for the place you are standing on is holy ground.”'),
  (15, 'Exodus & Wilderness', 'Passover Ready', 'Exodus 12:11', 'This is how you shall eat it: with your belt on your waist, your sandals on your feet, and your staff in your hand; and you shall eat it in haste: it is Yahweh’s Passover.'),
  (16, 'Exodus & Wilderness', 'Red Sea Crosser', 'Exodus 14:22', 'The children of Israel went into the middle of the sea on the dry ground, and the waters were a wall to them on their right hand, and on their left.'),
  (17, 'Exodus & Wilderness', 'Victory Song', 'Exodus 15:1', 'Then Moses and the children of Israel sang this song to Yahweh, and said, “I will sing to Yahweh, for he has triumphed gloriously. He has thrown the horse and his rider into the sea.'),
  (18, 'Exodus & Wilderness', 'Manna Gatherer', 'Exodus 16:18', 'When they measured it with an omer, he who gathered much had nothing over, and he who gathered little had no lack. They each gathered according to his eating.'),
  (19, 'Exodus & Wilderness', 'Raised Hands', 'Exodus 17:12', 'But Moses’ hands were heavy; so they took a stone, and put it under him, and he sat on it. Aaron and Hur held up his hands, the one on the one side, and the other on the other side. His hands were steady until sunset.'),
  (20, 'Exodus & Wilderness', 'Ten Words', 'Exodus 34:28', 'He was there with Yahweh forty days and forty nights; he neither ate bread, nor drank water. He wrote on the tablets the words of the covenant, the ten commandments.'),
  (21, 'Exodus & Wilderness', 'Shining Face', 'Exodus 34:29', 'When Moses came down from Mount Sinai with the two tablets of the covenant in Moses’ hand, when he came down from the mountain, Moses didn’t know that the skin of his face shone by reason of his speaking with him.'),
  (22, 'Exodus & Wilderness', 'Cloud Follower', 'Exodus 40:36', 'When the cloud was taken up from over the tabernacle, the children of Israel went onward, throughout all their journeys;'),
  (23, 'Exodus & Wilderness', 'Jubilee', 'Leviticus 25:10', 'You shall make the fiftieth year holy, and proclaim liberty throughout the land to all its inhabitants. It shall be a jubilee to you; and each of you shall return to his own property, and each of you shall return to his family.'),
  (24, 'Exodus & Wilderness', 'Nazirite', 'Numbers 6:2', 'Speak to the children of Israel, and tell them: ‘When either man or woman shall make a special vow, the vow of a Nazirite, to separate himself to Yahweh,'),
  (25, 'Exodus & Wilderness', 'Grape Carrier', 'Numbers 13:23', 'They came to the valley of Eshcol, and cut down from there a branch with one cluster of grapes, and they bore it on a staff between two. They also brought some of the pomegranates and figs.'),
  (26, 'Exodus & Wilderness', 'Different Spirit', 'Numbers 14:24', 'But my servant Caleb, because he had another spirit with him, and has followed me fully, him I will bring into the land into which he went. His offspring shall possess it.'),
  (27, 'Exodus & Wilderness', 'Choose Life', 'Deuteronomy 30:19', 'I call heaven and earth to witness against you today that I have set before you life and death, the blessing and the curse. Therefore choose life, that you may live, you and your descendants,'),
  (28, 'Promised Land', 'Scarlet Cord', 'Joshua 2:18', 'Behold, when we come into the land, tie this line of scarlet thread in the window which you used to let us down. Gather to yourself into the house your father, your mother, your brothers, and all your father’s household.'),
  (29, 'Promised Land', 'Step of Faith', 'Joshua 3:15', 'and when those who bore the ark had come to the Jordan, and the feet of the priests who bore the ark had dipped in the edge of the water (for the Jordan overflows all its banks all the time of harvest),'),
  (30, 'Promised Land', 'Memorial Stone', 'Joshua 4:7', 'then you shall tell them, ‘Because the waters of the Jordan were cut off before the ark of Yahweh’s covenant. When it crossed over the Jordan, the waters of the Jordan were cut off. These stones shall be for a memorial to the children of Israel forever.’'),
  (31, 'Promised Land', 'Jericho Shouter', 'Joshua 6:20', 'So the people shouted and the priests blew the trumpets. When the people heard the sound of the trumpet, the people shouted with a great shout, and the wall fell down flat, so that the people went up into the city, every man straight in front of him, and they took the city.'),
  (32, 'Promised Land', 'Sun Stopper', 'Joshua 10:13', 'The sun stood still, and the moon stayed, until the nation had avenged themselves of their enemies. Isn’t this written in the book of Jashar? The sun stayed in the middle of the sky, and didn’t hurry to go down about a whole day.'),
  (33, 'Promised Land', 'Mountain Claimer', 'Joshua 14:12', 'Now therefore give me this hill country, of which Yahweh spoke in that day; for you heard in that day how the Anakim were there, and great and fortified cities. It may be that Yahweh will be with me, and I shall drive them out, as Yahweh said.'),
  (34, 'Promised Land', 'Mighty Valor', 'Judges 6:12', 'Yahweh’s angel appeared to him, and said to him, “Yahweh is with you, you mighty man of valor!”'),
  (35, 'Promised Land', 'Fleece Tester', 'Judges 6:37', 'behold, I will put a fleece of wool on the threshing floor. If there is dew on the fleece only, and it is dry on all the ground, then I’ll know that you will save Israel by my hand, as you have spoken.'),
  (36, 'Promised Land', 'Three Hundred', 'Judges 7:7', 'Yahweh said to Gideon, “I will save you by the three hundred men who lapped, and deliver the Midianites into your hand. Let all the other people go, each to his own place.”'),
  (37, 'Promised Land', 'Torchbearer', 'Judges 7:20', 'The three companies blew the trumpets, broke the pitchers, and held the torches in their left hands and the trumpets in their right hands with which to blow; and they shouted, “The sword of Yahweh and of Gideon!”'),
  (38, 'Promised Land', 'Gleaner', 'Ruth 2:2', 'Ruth the Moabitess said to Naomi, “Let me now go to the field, and glean among the ears of grain after him in whose sight I find favor.” She said to her, “Go, my daughter.”'),
  (39, 'Kingdom', 'Unquenched Lamp', '1 Samuel 3:3', 'and God’s lamp hadn’t yet gone out, and Samuel had laid down in Yahweh’s temple where God’s ark was,'),
  (40, 'Kingdom', 'Here I Am', '1 Samuel 3:4', 'Yahweh called Samuel. He said, “Here I am.”'),
  (41, 'Kingdom', 'Ebenezer', '1 Samuel 7:12', 'Then Samuel took a stone, and set it between Mizpah and Shen, and called its name Ebenezer, saying, “Yahweh helped us until now.”'),
  (42, 'Kingdom', 'Five Stones', '1 Samuel 17:40', 'He took his staff in his hand, and chose for himself five smooth stones out of the brook, and put them in the pouch of his shepherd’s bag which he had. His sling was in his hand; and he came near to the Philistine.'),
  (43, 'Kingdom', 'Giant Slayer', '1 Samuel 17:50', 'So David prevailed over the Philistine with a sling and with a stone, and struck the Philistine, and killed him; but there was no sword in the hand of David.'),
  (44, 'Kingdom', 'Covenant Friend', '1 Samuel 18:3', 'Then Jonathan and David made a covenant, because he loved him as his own soul.'),
  (45, 'Kingdom', 'Undignified Dancer', '2 Samuel 6:22', 'I will be yet more vile than this, and will be worthless in my own sight. But the maids of whom you have spoken will honor me.'),
  (46, 'Kingdom', 'Psalmist', '2 Samuel 23:1', 'Now these are the last words of David. David the son of Jesse says, the man who was raised on high says, the anointed of the God of Jacob, the sweet psalmist of Israel:'),
  (47, 'Kingdom', 'Raven Fed', '1 Kings 17:6', 'The ravens brought him bread and meat in the morning, and bread and meat in the evening; and he drank from the brook.'),
  (48, 'Kingdom', 'Fire Caller', '1 Kings 18:38', 'Then Yahweh’s fire fell, and consumed the burnt offering, the wood, the stones, and the dust, and licked up the water that was in the trench.'),
  (49, 'Kingdom', 'Still Small Voice', '1 Kings 19:12', 'After the earthquake a fire passed; but Yahweh was not in the fire. After the fire, there was a still small voice.'),
  (50, 'Kingdom', 'Double Portion', '2 Kings 2:9', 'When they had gone over, Elijah said to Elisha, “Ask what I shall do for you, before I am taken from you.” Elisha said, “Please let a double portion of your spirit be on me.”'),
  (51, 'Kingdom', 'Chariot of Fire', '2 Kings 2:11', 'As they continued on and talked, behold, a chariot of fire and horses of fire separated them, and Elijah went up by a whirlwind into heaven.'),
  (52, 'Kingdom', 'Mantle Bearer', '2 Kings 2:13', 'He also took up Elijah’s mantle that fell from him, and went back, and stood by the bank of the Jordan.'),
  (53, 'Kingdom', 'Overflowing Jar', '2 Kings 4:6', 'When the containers were full, she said to her son, “Bring me another container.” He said to her, “There isn’t another container.” Then the oil stopped flowing.'),
  (54, 'Kingdom', 'Jordan Dipper', '2 Kings 5:14', 'Then went he down, and dipped himself seven times in the Jordan, according to the saying of the man of God; and his flesh was restored like the flesh of a little child, and he was clean.'),
  (55, 'Kingdom', 'Iron Floater', '2 Kings 6:6', 'The man of God asked, “Where did it fall?” He showed him the place. He cut down a stick, threw it in there, and made the iron float.'),
  (56, 'Return & Rebuild', 'Face Seeker', '2 Chronicles 7:14', 'if my people, who are called by my name, will humble themselves, pray, seek my face, and turn from their wicked ways; then I will hear from heaven, will forgive their sin, and will heal their land.'),
  (57, 'Return & Rebuild', 'Exile Returner', 'Ezra 1:3', 'Whoever there is among you of all his people, may his God be with him, and let him go up to Jerusalem, which is in Judah, and build the house of Yahweh, the God of Israel (he is God), which is in Jerusalem.'),
  (58, 'Return & Rebuild', 'Foundation Layer', 'Ezra 3:11', 'They sang to one another in praising and giving thanks to Yahweh, “For he is good, for his loving kindness endures forever toward Israel.” All the people shouted with a great shout, when they praised Yahweh, because the foundation of Yahweh’s house had been laid.'),
  (59, 'Return & Rebuild', 'Wall Builder', 'Nehemiah 4:6', 'So we built the wall; and all the wall was joined together to half its height: for the people had a mind to work.'),
  (60, 'Return & Rebuild', 'Sword & Trowel', 'Nehemiah 4:17', 'Those who built the wall, and those who bore burdens loaded themselves; everyone with one of his hands did the work, and with the other held his weapon.'),
  (61, 'Return & Rebuild', 'Joy Strong', 'Nehemiah 8:10', 'Then he said to them, “Go your way. Eat the fat, drink the sweet, and send portions to him for whom nothing is prepared, for today is holy to our Lord. Don’t be grieved, for the joy of Yahweh is your strength.”'),
  (62, 'Return & Rebuild', 'Such a Time', 'Esther 4:14', 'For if you remain silent now, then relief and deliverance will come to the Jews from another place, but you and your father’s house will perish. Who knows if you haven’t come to the kingdom for such a time as this?'),
  (63, 'Wisdom', 'Refined Gold', 'Job 23:10', 'But he knows the way that I take. When he has tried me, I will come out like gold.'),
  (64, 'Wisdom', 'Pure Gaze', 'Job 31:1', 'I made a covenant with my eyes, how then should I look lustfully at a young woman?'),
  (65, 'Wisdom', 'Streamside Tree', 'Psalm 1:3', 'He will be like a tree planted by the streams of water, that produces its fruit in its season, whose leaf also does not wither. Whatever he does shall prosper.'),
  (66, 'Wisdom', 'Thirsty Deer', 'Psalm 42:1', 'As the deer pants for the water brooks, so my soul pants after you, God.'),
  (67, 'Wisdom', 'Clean Heart', 'Psalm 51:10', 'Create in me a clean heart, O God. Renew a right spirit within me.'),
  (68, 'Wisdom', 'Shelter Dweller', 'Psalm 91:1', 'He who dwells in the secret place of the Most High will rest in the shadow of the Almighty.'),
  (69, 'Wisdom', 'Cedar of Lebanon', 'Psalm 92:12', 'The righteous shall flourish like the palm tree. He will grow like a cedar in Lebanon.'),
  (70, 'Wisdom', 'Word Hider', 'Psalm 119:11', 'I have hidden your word in my heart, that I might not sin against you.'),
  (71, 'Wisdom', 'Guarded Heart', 'Proverbs 4:23', 'Keep your heart with all diligence, for out of it is the wellspring of life.'),
  (72, 'Wisdom', 'Ant Watcher', 'Proverbs 6:6', 'Go to the ant, you sluggard. Consider her ways, and be wise;'),
  (73, 'Wisdom', 'Iron Sharpener', 'Proverbs 27:17', 'Iron sharpens iron; so a man sharpens his friend’s countenance.'),
  (74, 'Wisdom', 'Lionheart', 'Proverbs 28:1', 'The wicked flee when no one pursues; but the righteous are as bold as a lion.'),
  (75, 'Wisdom', 'Threefold Cord', 'Ecclesiastes 4:12', 'If a man prevails against one who is alone, two shall withstand him; and a threefold cord is not quickly broken.'),
  (76, 'Wisdom', 'Fox Catcher', 'Song of Songs 2:15', 'Catch for us the foxes, the little foxes that plunder the vineyards; for our vineyards are in blossom.'),
  (77, 'Wisdom', 'Many Waters', 'Song of Songs 8:7', 'Many waters can’t quench love, neither can floods drown it. If a man would give all the wealth of his house for love, he would be utterly scorned.'),
  (78, 'Prophets', 'Plowshare', 'Isaiah 2:4', 'He will judge between the nations, and will decide concerning many peoples. They shall beat their swords into plowshares, and their spears into pruning hooks. Nation shall not lift up sword against nation, neither shall they learn war any more.'),
  (79, 'Prophets', 'Live Coal', 'Isaiah 6:6', 'Then one of the seraphim flew to me, having a live coal in his hand, which he had taken with the tongs from off the altar.'),
  (80, 'Prophets', 'Highway Maker', 'Isaiah 40:3', 'The voice of one who calls out, “Prepare the way of Yahweh in the wilderness! Make a level highway in the desert for our God.'),
  (81, 'Prophets', 'Eagle Soarer', 'Isaiah 40:31', 'but those who wait for Yahweh will renew their strength. They will mount up with wings like eagles. They will run, and not be weary. They will walk, and not faint.'),
  (82, 'Prophets', 'Beauty for Ashes', 'Isaiah 61:3', 'to provide for those who mourn in Zion, to give to them a garland for ashes, the oil of joy for mourning, the garment of praise for the spirit of heaviness, that they may be called trees of righteousness, the planting of Yahweh, that he may be glorified.'),
  (83, 'Prophets', 'Oak of Righteousness', 'Isaiah 61:3', 'to provide for those who mourn in Zion, to give to them a garland for ashes, the oil of joy for mourning, the garment of praise for the spirit of heaviness, that they may be called trees of righteousness, the planting of Yahweh, that he may be glorified.'),
  (84, 'Prophets', 'Watchman', 'Isaiah 62:6', 'I have set watchmen on your walls, Jerusalem. They will never be silent day nor night. You who call on Yahweh, take no rest,'),
  (85, 'Prophets', 'Fire in My Bones', 'Jeremiah 20:9', 'If I say, I will not make mention of him, or speak any more in his name, then there is in my heart as it were a burning fire shut up in my bones. I am weary with holding it in. I can’t.'),
  (86, 'Prophets', 'New Mercies', 'Lamentations 3:23', 'They are new every morning. Great is your faithfulness.'),
  (87, 'Prophets', 'Heart of Flesh', 'Ezekiel 36:26', 'I will also give you a new heart, and I will put a new spirit within you. I will take away the stony heart out of your flesh, and I will give you a heart of flesh.'),
  (88, 'Prophets', 'Dry Bones Rising', 'Ezekiel 37:10', 'So I prophesied as he commanded me, and the breath came into them, and they lived, and stood up on their feet, an exceedingly great army.'),
  (89, 'Prophets', 'Resolved', 'Daniel 1:8', 'But Daniel purposed in his heart that he would not defile himself with the king’s dainties, nor with the wine which he drank. Therefore he requested of the prince of the eunuchs that he might not defile himself.'),
  (90, 'Prophets', 'Fireproof', 'Daniel 3:27', 'The local governors, the deputies, and the governors, and the king’s counselors, being gathered together, saw these men, that the fire had no power on their bodies. The hair of their head wasn’t singed. Their pants weren’t changed, the smell of fire wasn’t even on them.'),
  (91, 'Prophets', 'Lion''s Den', 'Daniel 6:22', 'My God has sent his angel, and has shut the lions’ mouths, and they have not hurt me; because as before him innocence was found in me; and also before you, O king, I have done no harm.'),
  (92, 'Prophets', 'Door of Hope', 'Hosea 2:15', 'I will give her vineyards from there, and the valley of Achor for a door of hope; and she will respond there, as in the days of her youth, and as in the day when she came up out of the land of Egypt.'),
  (93, 'Prophets', 'Restored Years', 'Joel 2:25', 'I will restore to you the years that the swarming locust has eaten, the great locust, the grasshopper, and the caterpillar, my great army, which I sent among you.'),
  (94, 'Prophets', 'Second Chance', 'Jonah 3:1', 'Yahweh’s word came to Jonah the second time, saying,'),
  (95, 'Prophets', 'Humble Walker', 'Micah 6:8', 'He has shown you, O man, what is good. What does Yahweh require of you, but to act justly, to love mercy, and to walk humbly with your God?'),
  (96, 'Prophets', 'Hind''s Feet', 'Habakkuk 3:19', 'Yahweh, the Lord, is my strength. He makes my feet like deer’s feet, and enables me to go in high places. For the music director, on my stringed instruments.'),
  (97, 'Prophets', 'Brand from the Fire', 'Zechariah 3:2', 'Yahweh said to Satan, “Yahweh rebuke you, Satan! Yes, Yahweh who has chosen Jerusalem rebuke you! Isn’t this a burning stick plucked out of the fire?”'),
  (98, 'Prophets', 'Not by Might', 'Zechariah 4:6', 'Then he answered and spoke to me, saying, “This is Yahweh’s word to Zerubbabel, saying, ‘Not by might, nor by power, but by my Spirit,’ says Yahweh of Armies.'),
  (99, 'Prophets', 'Prisoner of Hope', 'Zechariah 9:12', 'Turn to the stronghold, you prisoners of hope! Even today I declare that I will restore double to you.'),
  (100, 'Prophets', 'Leaping Calf', 'Malachi 4:2', 'But to you who fear my name shall the sun of righteousness arise with healing in its wings. You will go out, and leap like calves of the stall.'),
  (101, 'Gospels', 'Voice in the Wilderness', 'Matthew 3:3', 'For this is he who was spoken of by Isaiah the prophet, saying, “The voice of one crying in the wilderness, make the way of the Lord ready! Make his paths straight!”'),
  (102, 'Gospels', 'Locust Eater', 'Matthew 3:4', 'Now John himself wore clothing made of camel’s hair, with a leather belt around his waist. His food was locusts and wild honey.'),
  (103, 'Gospels', 'Net Caster', 'Matthew 4:19', 'He said to them, “Come after me, and I will make you fishers for men.”'),
  (104, 'Gospels', 'Pure in Heart', 'Matthew 5:8', 'Blessed are the pure in heart, for they shall see God.'),
  (105, 'Gospels', 'Salt of the Earth', 'Matthew 5:13', 'You are the salt of the earth, but if the salt has lost its flavor, with what will it be salted? It is then good for nothing, but to be cast out and trodden under the feet of men.'),
  (106, 'Gospels', 'City on a Hill', 'Matthew 5:14', 'You are the light of the world. A city located on a hill can’t be hidden.'),
  (107, 'Gospels', 'Extra Miler', 'Matthew 5:41', 'Whoever compels you to go one mile, go with him two.'),
  (108, 'Gospels', 'Narrow Gate', 'Matthew 7:13', 'Enter in by the narrow gate; for wide is the gate and broad is the way that leads to destruction, and many are those who enter in by it.'),
  (109, 'Gospels', 'Rock Solid', 'Matthew 7:24', 'Everyone therefore who hears these words of mine, and does them, I will liken him to a wise man, who built his house on a rock.'),
  (110, 'Gospels', 'Yoke Bearer', 'Matthew 11:29', 'Take my yoke upon you, and learn from me, for I am gentle and humble in heart; and you will find rest for your souls.'),
  (111, 'Gospels', 'Good Soil', 'Matthew 13:23', 'What was sown on the good ground, this is he who hears the word, and understands it, who most certainly bears fruit, and produces, some one hundred times as much, some sixty, and some thirty.'),
  (112, 'Gospels', 'Pearl Merchant', 'Matthew 13:45', 'Again, the Kingdom of Heaven is like a man who is a merchant seeking fine pearls,'),
  (113, 'Gospels', 'Water Walker', 'Matthew 14:29', 'He said, “Come!” Peter stepped down from the boat, and walked on the waters to come to Jesus.'),
  (114, 'Gospels', 'Mountain Mover', 'Matthew 17:20', 'He said to them, “Because of your unbelief. For most certainly I tell you, if you have faith as a grain of mustard seed, you will tell this mountain, ‘Move from here to there,’ and it will move; and nothing will be impossible for you.'),
  (115, 'Gospels', 'Seventy Times Seven', 'Matthew 18:22', 'Jesus said to him, “I don’t tell you until seven times, but, until seventy times seven.'),
  (116, 'Gospels', 'Oil Keeper', 'Matthew 25:4', 'but the wise took oil in their vessels with their lamps.'),
  (117, 'Gospels', 'Talent Multiplier', 'Matthew 25:20', 'He who received the five talents came and brought another five talents, saying, ‘Lord, you delivered to me five talents. Behold, I have gained another five talents in addition to them.’'),
  (118, 'Gospels', 'Roof Breaker', 'Mark 2:4', 'When they could not come near to him for the crowd, they removed the roof where he was. When they had broken it up, they let down the mat that the paralytic was lying on.'),
  (119, 'Gospels', 'Alabaster Jar', 'Mark 14:3', 'While he was at Bethany, in the house of Simon the leper, as he sat at the table, a woman came having an alabaster jar of ointment of pure nard—very costly. She broke the jar, and poured it over his head.'),
  (120, 'Gospels', 'Homecomer', 'Luke 15:20', 'He arose, and came to his father. But while he was still far off, his father saw him, and was moved with compassion, and ran, and fell on his neck, and kissed him.'),
  (121, 'Gospels', 'Sycamore Climber', 'Luke 19:4', 'He ran on ahead, and climbed up into a sycamore tree to see him, for he was going to pass that way.'),
  (122, 'Gospels', 'Road to Emmaus', 'Luke 24:32', 'They said to one another, “Weren’t our hearts burning within us, while he spoke to us along the way, and while he opened the Scriptures to us?”'),
  (123, 'Gospels', 'Wellspring', 'John 4:14', 'but whoever drinks of the water that I will give him will never thirst again; but the water that I will give him will become in him a well of water springing up to eternal life.'),
  (124, 'Gospels', 'Unbound', 'John 11:44', 'He who was dead came out, bound hand and foot with wrappings, and his face was wrapped around with a cloth. Jesus said to them, “Free him, and let him go.”'),
  (125, 'Gospels', 'Foot Washer', 'John 13:14', 'If I then, the Lord and the Teacher, have washed your feet, you also ought to wash one another’s feet.'),
  (126, 'Gospels', 'Vine Abider', 'John 15:4', 'Remain in me, and I in you. As the branch can’t bear fruit by itself unless it remains in the vine, so neither can you, unless you remain in me.'),
  (127, 'Acts', 'Upper Room', 'Acts 1:13', 'When they had come in, they went up into the upper room where they were staying; that is Peter, John, James, Andrew, Philip, Thomas, Bartholomew, Matthew, James the son of Alphaeus, Simon the Zealot, and Judas the son of James.'),
  (128, 'Acts', 'Pentecost Flame', 'Acts 2:3', 'Tongues like fire appeared and were distributed to them, and one sat on each of them.'),
  (129, 'Acts', 'Beautiful Gate', 'Acts 3:8', 'Leaping up, he stood and began to walk. He entered with them into the temple, walking, leaping, and praising God.'),
  (130, 'Acts', 'Encourager', 'Acts 4:36', 'Joses, who by the apostles was also called Barnabas (which is, being interpreted, Son of Encouragement), a Levite, a man of Cyprus by race,'),
  (131, 'Acts', 'Scales Fallen', 'Acts 9:18', 'Immediately something like scales fell from his eyes, and he received his sight. He arose and was baptized.'),
  (132, 'Acts', 'Chainbreaker', 'Acts 12:7', 'And behold, an angel of the Lord stood by him, and a light shone in the cell. He struck Peter on the side, and woke him up, saying, “Stand up quickly!” His chains fell off his hands.'),
  (133, 'Acts', 'Midnight Singer', 'Acts 16:25', 'But about midnight Paul and Silas were praying and singing hymns to God, and the prisoners were listening to them.'),
  (134, 'Acts', 'World Turner', 'Acts 17:6', 'When they didn’t find them, they dragged Jason and certain brothers before the rulers of the city, crying, “These who have turned the world upside down have come here also,'),
  (135, 'Acts', 'Berean', 'Acts 17:11', 'Now these were more noble than those in Thessalonica, in that they received the word with all readiness of mind, examining the Scriptures daily to see whether these things were so.'),
  (136, 'Acts', 'Shipwreck Survivor', 'Acts 27:44', 'and the rest should follow, some on planks, and some on other things from the ship. So they all escaped safely to the land.'),
  (137, 'Acts', 'Viper Shaker', 'Acts 28:5', 'However he shook off the creature into the fire, and wasn’t harmed.'),
  (138, 'Letters', 'More Than Conqueror', 'Romans 8:37', 'No, in all these things, we are more than conquerors through him who loved us.'),
  (139, 'Letters', 'Living Sacrifice', 'Romans 12:1', 'Therefore I urge you, brothers, by the mercies of God, to present your bodies a living sacrifice, holy, acceptable to God, which is your spiritual service.'),
  (140, 'Letters', 'Renewed Mind', 'Romans 12:2', 'Don’t be conformed to this world, but be transformed by the renewing of your mind, so that you may prove what is the good, well-pleasing, and perfect will of God.'),
  (141, 'Letters', 'Temple Keeper', '1 Corinthians 6:19', 'Or don’t you know that your body is a temple of the Holy Spirit who is in you, whom you have from God? You are not your own,'),
  (142, 'Letters', 'Race Runner', '1 Corinthians 9:24', 'Don’t you know that those who run in a race all run, but one receives the prize? Run like that, that you may win.'),
  (143, 'Letters', 'Escape Artist', '1 Corinthians 10:13', 'No temptation has taken you except what is common to man. God is faithful, who will not allow you to be tempted above what you are able, but will with the temptation also make the way of escape, that you may be able to endure it.'),
  (144, 'Letters', 'New Creation', '2 Corinthians 5:17', 'Therefore if anyone is in Christ, he is a new creation. The old things have passed away. Behold, all things have become new.'),
  (145, 'Letters', 'Spirit Walker', 'Galatians 5:16', 'But I say, walk by the Spirit, and you won’t fulfill the lust of the flesh.'),
  (146, 'Letters', 'Fruitful', 'Galatians 5:22', 'But the fruit of the Spirit is love, joy, peace, patience, kindness, goodness, faith,'),
  (147, 'Letters', 'Belt of Truth', 'Ephesians 6:14', 'Stand therefore, having the utility belt of truth buckled around your waist, and having put on the breastplate of righteousness,'),
  (148, 'Letters', 'Breastplate', 'Ephesians 6:14', 'Stand therefore, having the utility belt of truth buckled around your waist, and having put on the breastplate of righteousness,'),
  (149, 'Letters', 'Gospel Boots', 'Ephesians 6:15', 'and having fitted your feet with the preparation of the Good News of peace,'),
  (150, 'Letters', 'Shield of Faith', 'Ephesians 6:16', 'above all, taking up the shield of faith, with which you will be able to quench all the fiery darts of the evil one.'),
  (151, 'Letters', 'Helmet of Salvation', 'Ephesians 6:17', 'And take the helmet of salvation, and the sword of the Spirit, which is the word of God;'),
  (152, 'Letters', 'Sword of the Spirit', 'Ephesians 6:17', 'And take the helmet of salvation, and the sword of the Spirit, which is the word of God;'),
  (153, 'Letters', 'Unashamed', '2 Timothy 2:15', 'Give diligence to present yourself approved by God, a workman who doesn’t need to be ashamed, properly handling the Word of Truth.'),
  (154, 'Letters', 'Vessel of Honor', '2 Timothy 2:21', 'If anyone therefore purges himself from these, he will be a vessel for honor, sanctified, and suitable for the master’s use, prepared for every good work.'),
  (155, 'Letters', 'Royal Priest', '1 Peter 2:9', 'But you are a chosen race, a royal priesthood, a holy nation, a people for God’s own possession, that you may proclaim the excellence of him who called you out of darkness into his marvelous light.'),
  (156, 'Glory', 'Overcomer', 'Revelation 2:7', 'He who has an ear, let him hear what the Spirit says to the assemblies. To him who overcomes I will give to eat from the tree of life, which is in the Paradise of my God.'),
  (157, 'Glory', 'Tree of Life', 'Revelation 2:7', 'He who has an ear, let him hear what the Spirit says to the assemblies. To him who overcomes I will give to eat from the tree of life, which is in the Paradise of my God.'),
  (158, 'Glory', 'Crown of Life', 'Revelation 2:10', 'Don’t be afraid of the things which you are about to suffer. Behold, the devil is about to throw some of you into prison, that you may be tested; and you will have oppression for ten days. Be faithful to death, and I will give you the crown of life.'),
  (159, 'Glory', 'Hidden Manna', 'Revelation 2:17', 'He who has an ear, let him hear what the Spirit says to the assemblies. To him who overcomes, to him I will give of the hidden manna, and I will give him a white stone, and on the stone a new name written, which no one knows but he who receives it.'),
  (160, 'Glory', 'White Stone', 'Revelation 2:17', 'He who has an ear, let him hear what the Spirit says to the assemblies. To him who overcomes, to him I will give of the hidden manna, and I will give him a white stone, and on the stone a new name written, which no one knows but he who receives it.'),
  (161, 'Glory', 'White Robe', 'Revelation 3:5', 'He who overcomes will be arrayed in white garments, and I will in no way blot his name out of the book of life, and I will confess his name before my Father, and before his angels.'),
  (162, 'Glory', 'Temple Pillar', 'Revelation 3:12', 'He who overcomes, I will make him a pillar in the temple of my God, and he will go out from there no more. I will write on him the name of my God and the name of the city of my God, the new Jerusalem, which comes down out of heaven from my God, and my own new name.'),
  (163, 'Glory', 'Crystal Sea', 'Revelation 15:2', 'I saw something like a sea of glass mixed with fire, and those who overcame the beast, his image, and the number of his name, standing on the sea of glass, having harps of God.'),
  (164, 'Glory', 'Golden Harp', 'Revelation 15:2', 'I saw something like a sea of glass mixed with fire, and those who overcame the beast, his image, and the number of his name, standing on the sea of glass, having harps of God.'),
  (165, 'Glory', 'Pearl Gate', 'Revelation 21:21', 'The twelve gates were twelve pearls. Each one of the gates was made of one pearl. The street of the city was pure gold, like transparent glass.'),
  (166, 'Glory', 'Golden Street', 'Revelation 21:21', 'The twelve gates were twelve pearls. Each one of the gates was made of one pearl. The street of the city was pure gold, like transparent glass.'),
  (167, 'Glory', 'Well Done', 'Matthew 25:21', 'His lord said to him, ‘Well done, good and faithful servant. You have been faithful over a few things, I will set you over many things. Enter into the joy of your lord.’');

-- Clean days needed to go from p_level to p_level + 1.
create or replace function util.level_days_to_next(p_level integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_level + 1 <= 20 then 5 else 10 end;
$$;

-- Clean days from Level 0 to p_level without a break (data/levels.csv days_from_level_0).
create or replace function util.level_days(p_level integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_level <= 20 then 5 * p_level else 100 + 10 * (p_level - 20) end;
$$;

-- Tier for a level, before capping at the last named tier.
create or replace function util.level_tier_number(p_level integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_level <= 0 then 0 else (p_level - 1) / 6 + 1 end;
$$;

-- "", "Lite", "Pro", "Max", "Ultra", "Ultra Pro Max".
create or replace function util.level_variant(p_level integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_level <= 0 then ''
              else (array['', 'Lite', 'Pro', 'Max', 'Ultra', 'Ultra Pro Max'])[(p_level - 1) % 6 + 1] end;
$$;

-- The level's name, era and verse. Past the last named tier (Level 1002), the
-- last name continues with a number: "Well Done 2", "Well Done 2 Lite"… until
-- new names are added to level_tiers.
create or replace function util.level_info(p_level integer)
returns table (level integer, label text, tier integer, era text, tier_name text, reference text, verse_text text)
language sql
stable
security definer
set search_path = ''
as $$
  with n as (
    select util.level_tier_number(greatest(p_level, 0)) as wanted, (select max(t.tier) from public.level_tiers t) as last
  )
  select greatest(p_level, 0),
         btrim(t.name
               || case when n.wanted > n.last then ' ' || (n.wanted - n.last + 1)::text else '' end
               || ' ' || util.level_variant(greatest(p_level, 0))),
         t.tier, t.era, t.name, t.reference, t.verse_text
    from n
    join public.level_tiers t on t.tier = least(n.wanted, n.last);
$$;

create or replace function util.level_label(p_level integer)
returns text
language sql
stable
set search_path = ''
as $$
  select label from util.level_info(p_level);
$$;

grant execute on function util.level_days_to_next(integer) to authenticated, service_role;
grant execute on function util.level_days(integer) to authenticated, service_role;
grant execute on function util.level_tier_number(integer) to authenticated, service_role;
grant execute on function util.level_variant(integer) to authenticated, service_role;
grant execute on function util.level_info(integer) to authenticated, service_role;
grant execute on function util.level_label(integer) to authenticated, service_role;

-- ---------------------------------------------------------------- closing-account pauses

-- While an account is closing for deletion, check-ins are refused
-- (checkins.errors.accountClosing). Days whose window closes in that time
-- don't count as missed, so someone who keeps their account isn't charged for
-- them (owner, 2026-10-10, D-066).
create table private.account_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);

create index account_pauses_user on private.account_pauses (user_id, started_at);
create unique index account_pauses_one_open on private.account_pauses (user_id) where ended_at is null;

comment on table private.account_pauses is
  'When an account was closing for deletion. Days whose check-in window closed inside a pause are not missed (D-066).';

-- The instant a day's check-in window closes: 12:00 local time the next day.
create or replace function util.window_close(p_day date, p_tz text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_day + 1)::timestamp + time '12:00') at time zone p_tz;
$$;

grant execute on function util.window_close(date, text) to authenticated, service_role;

-- Days in [p_from, p_to] whose window closes inside one of the person's pauses.
create or replace function private.paused_dates(p_user uuid, p_from date, p_to date, p_tz text)
returns date[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct d order by d), '{}')
    from private.account_pauses a
    cross join lateral generate_series(
      greatest(p_from, (a.started_at at time zone p_tz)::date - 2),
      least(p_to, coalesce((a.ended_at at time zone p_tz)::date, p_to)),
      interval '1 day'
    ) g(day)
    cross join lateral (select g.day::date as d) x
   where a.user_id = p_user
     and p_from <= p_to
     and a.started_at <= util.window_close(x.d, p_tz)
     and (a.ended_at is null or a.ended_at > util.window_close(x.d, p_tz));
$$;

-- ---------------------------------------------------------------- user_stats columns

alter table public.user_stats
  add column level integer not null default 0 check (level >= 0),
  add column level_progress_days integer not null default 0 check (level_progress_days >= 0),
  add column highest_level integer not null default 0 check (highest_level >= 0),
  -- The same replay with an unanswered yesterday not yet missed. Used until
  -- level_open_until (yesterday's window closing), then the values above.
  add column level_open integer check (level_open >= 0),
  add column level_open_progress_days integer check (level_open_progress_days >= 0),
  add column level_open_highest integer check (level_open_highest >= 0),
  add column level_open_until timestamptz,
  -- The live level just before the last save: the check-in page shows a
  -- level-up or the quiet level-down line by comparing with it.
  add column level_before_save integer check (level_before_save >= 0);

comment on column public.user_stats.level is
  'Level as of the last check-in (§7.6). Read it through private.live_level(): missed days since then cost levels (D-064).';

-- ---------------------------------------------------------------- the replay

create or replace function private.recompute_level(p_user uuid, p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_start date;
  v_first date;
  v_last date;
  v_first_open date;
  v_pen integer := util.config_int('relapse_level_penalty');
  v_paused date[];
  r record;
  -- Settled: an open, unanswered day counts as missed. Open: it doesn't yet.
  l integer := 0; pr integer := 0; h integer := 0;
  ol integer := 0; op integer := 0; oh integer := 0;
  v_open_until timestamptz;
begin
  select p.timezone, (p.created_at at time zone p.timezone)::date into v_tz, v_start
    from public.profiles p where p.id = p_user;
  if v_tz is null then
    return;
  end if;
  select min(c.local_date), max(c.local_date) into v_first, v_last
    from public.checkins c where c.user_id = p_user;

  if v_last is not null then
    -- Yesterday may be answered on the day the account was made.
    v_start := least(v_start, v_first);
    select min(d) into v_first_open from unnest(util.checkin_dates(v_tz, p_now)) d;
    v_paused := private.paused_dates(p_user, v_start, v_last, v_tz);

    for r in
      select g.day::date as d, c.outcome
        from generate_series(v_start, v_last, interval '1 day') g(day)
        left join public.checkins c on c.user_id = p_user and c.local_date = g.day::date
       order by 1
    loop
      if r.outcome = 'clean' then
        pr := pr + 1;
        if pr >= util.level_days_to_next(l) then l := l + 1; pr := 0; h := greatest(h, l); end if;
        op := op + 1;
        if op >= util.level_days_to_next(ol) then ol := ol + 1; op := 0; oh := greatest(oh, ol); end if;
      elsif r.outcome = 'slipped' then
        l := greatest(0, l - v_pen); pr := 0;
        ol := greatest(0, ol - v_pen); op := 0;
      elsif r.d = any (v_paused) then
        null;
      elsif r.d >= v_first_open then
        -- Unanswered, but its window is still open: not missed yet.
        l := greatest(0, l - v_pen); pr := 0;
        v_open_until := util.window_close(r.d, v_tz);
      else
        l := greatest(0, l - v_pen); pr := 0;
        ol := greatest(0, ol - v_pen); op := 0;
      end if;
    end loop;
  end if;

  insert into public.user_stats as s (user_id, level, level_progress_days, highest_level,
                                      level_open, level_open_progress_days, level_open_highest, level_open_until)
  values (p_user, l, pr, h,
          case when v_open_until is not null then ol end,
          case when v_open_until is not null then op end,
          case when v_open_until is not null then oh end,
          v_open_until)
  on conflict (user_id) do update set
    level = excluded.level,
    level_progress_days = excluded.level_progress_days,
    highest_level = excluded.highest_level,
    level_open = excluded.level_open,
    level_open_progress_days = excluded.level_open_progress_days,
    level_open_highest = excluded.level_open_highest,
    level_open_until = excluded.level_open_until;
end;
$$;

-- The level as it stands now: the stored replay, minus the penalty for each
-- day after the last check-in whose window has closed (and wasn't paused).
create or replace function private.live_level(
  p_user uuid, p_tz text, p_now timestamptz default now(),
  out level integer, out progress integer, out highest integer, out missed integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.user_stats;
  v_last_closed date;
begin
  select * into s from public.user_stats u where u.user_id = p_user;
  if s.user_id is null or s.last_checkin_date is null then
    level := 0; progress := 0; highest := coalesce(s.highest_level, 0); missed := 0;
    return;
  end if;
  if s.level_open_until is not null and p_now < s.level_open_until then
    level := s.level_open; progress := s.level_open_progress_days; highest := s.level_open_highest;
  else
    level := s.level; progress := s.level_progress_days; highest := s.highest_level;
  end if;

  select min(d) - 1 into v_last_closed from unnest(util.checkin_dates(p_tz, p_now)) d;
  missed := 0;
  if v_last_closed > s.last_checkin_date then
    missed := (v_last_closed - s.last_checkin_date)
              - cardinality(private.paused_dates(p_user, s.last_checkin_date + 1, v_last_closed, p_tz));
  end if;
  if missed > 0 then
    level := greatest(0, level - util.config_int('relapse_level_penalty') * missed);
    progress := 0;
  end if;
end;
$$;

revoke all on function private.recompute_level(uuid, timestamptz) from public;
revoke all on function private.live_level(uuid, text, timestamptz) from public;
revoke all on function private.paused_dates(uuid, date, date, text) from public;

-- For the views below, which run their functions with the viewer's rights:
-- a member's live level, in their own time zone. The views decide who may see it.
create or replace function util.member_level(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (private.live_level(p.id, p.timezone, now())).level from public.profiles p where p.id = p_user;
$$;

revoke all on function util.member_level(uuid) from public, anon;
grant execute on function util.member_level(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- pauses follow deletion requests

create or replace function private.track_account_pause()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deletion_requested_at is not null and old.deletion_requested_at is null then
    insert into private.account_pauses (user_id, started_at)
    values (new.id, new.deletion_requested_at)
    on conflict do nothing;
  elsif new.deletion_requested_at is null and old.deletion_requested_at is not null then
    update private.account_pauses set ended_at = now()
     where user_id = new.id and ended_at is null;
    -- Kept the account: the paused days come out of the replay.
    perform private.recompute_level(new.id, now());
  end if;
  return null;
end;
$$;

create trigger profiles_track_account_pause
  after update of deletion_requested_at on public.profiles
  for each row execute function private.track_account_pause();

-- Accounts already closing when this runs.
insert into private.account_pauses (user_id, started_at)
select id, deletion_requested_at from public.profiles
 where deletion_requested_at is not null and deleted_at is null;

-- ---------------------------------------------------------------- saving recalculates the level

create or replace function private.save_checkin(
  p_user uuid,
  p_tz text,
  p_local_date date,
  p_outcome text,
  p_mood integer,
  p_urge_level integer,
  p_triggers text[],
  p_note_encrypted text,
  p_now timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_triggers text[];
  v_id uuid;
  v_created boolean;
  v_before integer := (private.live_level(p_user, p_tz, p_now)).level;
begin
  if p_local_date is null or not (p_local_date = any (util.checkin_dates(p_tz, p_now))) then
    raise exception 'checkin_window_closed';
  end if;
  if p_outcome is null or p_outcome not in ('clean', 'slipped')
     or (p_mood is not null and p_mood not between 1 and 5)
     or (p_urge_level is not null and p_urge_level not between 0 and 5) then
    raise exception 'checkin_invalid';
  end if;
  v_triggers := private.clean_triggers(p_triggers);
  perform private.check_note(p_note_encrypted);

  insert into public.checkins as c (user_id, local_date, timezone, outcome, mood, urge_level, triggers, note_encrypted)
  values (p_user, p_local_date, p_tz, p_outcome, p_mood, p_urge_level, v_triggers, p_note_encrypted)
  on conflict (user_id, local_date) do update set
    timezone = excluded.timezone,
    outcome = excluded.outcome,
    mood = excluded.mood,
    urge_level = excluded.urge_level,
    triggers = excluded.triggers,
    note_encrypted = excluded.note_encrypted,
    edit_count = c.edit_count + 1
  returning c.id, (xmax = 0) into v_id, v_created;

  -- Edits are audited (§7.5): which check-in, never what it says.
  if not v_created then
    perform util.audit(p_user, 'checkin.edited', 'checkin', v_id, '{}'::jsonb);
  end if;

  perform private.after_checkin_saved(p_user, v_before, p_now);
  return case when v_created then 'created' else 'updated' end;
end;
$$;

-- Everything a saved check-in changes: streaks, level, group stats.
create or replace function private.after_checkin_saved(p_user uuid, p_level_before integer, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recompute_user_stats(p_user);
  perform private.recompute_level(p_user, p_now);
  update public.user_stats set level_before_save = p_level_before where user_id = p_user;
  perform private.refresh_group_stats(null, p_user);
end;
$$;

revoke all on function private.after_checkin_saved(uuid, integer, timestamptz) from public;

-- ---------------------------------------------------------------- late offline check-ins

-- A check-in made on a device without internet, sent when it reconnects
-- (§7.5, §13; the device queue is Phase 10). p_recorded_at is when the device
-- says it was made. Device clocks can be changed, so the limits below are the
-- guard against backfilling (docs/threat-model.md):
--   * it was inside its window by the device's record (today, or yesterday
--     before 12:00, at p_recorded_at, in the person's time zone);
--   * p_recorded_at isn't in the future (5 minutes allowed for drift) and
--     isn't before the account existed;
--   * it arrives within offline_sync_max_days of p_recorded_at;
--   * the day has no answer yet. While the day's window is still open, it is
--     an ordinary save (an edit if there is one).
-- Accepted late ones are audited as checkin.synced_late (id and date only).
-- Returns 'created', 'updated' (inside the window) or 'synced_late'.
create or replace function private.save_offline_checkin(
  p_user uuid,
  p_tz text,
  p_local_date date,
  p_recorded_at timestamptz,
  p_outcome text,
  p_mood integer,
  p_urge_level integer,
  p_triggers text[],
  p_note_encrypted text,
  p_now timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_at timestamptz;
  v_before integer;
  v_id uuid;
begin
  if p_recorded_at is null or p_local_date is null then
    raise exception 'checkin_invalid';
  end if;
  select created_at into v_created_at from public.profiles where id = p_user;
  if p_recorded_at > p_now + interval '5 minutes' or p_recorded_at < v_created_at then
    raise exception 'checkin_invalid';
  end if;
  if p_recorded_at < p_now - make_interval(days => util.config_int('offline_sync_max_days')) then
    raise exception 'checkin_sync_too_old';
  end if;
  if not (p_local_date = any (util.checkin_dates(p_tz, p_recorded_at))) then
    raise exception 'checkin_window_closed';
  end if;

  -- Still answerable now: exactly like answering online.
  if p_local_date = any (util.checkin_dates(p_tz, p_now)) then
    return private.save_checkin(p_user, p_tz, p_local_date, p_outcome, p_mood, p_urge_level, p_triggers,
                                p_note_encrypted, p_now);
  end if;

  if p_outcome is null or p_outcome not in ('clean', 'slipped')
     or (p_mood is not null and p_mood not between 1 and 5)
     or (p_urge_level is not null and p_urge_level not between 0 and 5) then
    raise exception 'checkin_invalid';
  end if;
  perform private.check_note(p_note_encrypted);

  v_before := (private.live_level(p_user, p_tz, p_now)).level;
  insert into public.checkins (user_id, local_date, timezone, outcome, mood, urge_level, triggers, note_encrypted)
  values (p_user, p_local_date, p_tz, p_outcome, p_mood, p_urge_level, private.clean_triggers(p_triggers),
          p_note_encrypted)
  on conflict (user_id, local_date) do nothing
  returning id into v_id;
  if v_id is null then
    -- Answered already (online, or by an earlier sync): the device drops it.
    raise exception 'checkin_already_answered';
  end if;

  perform util.audit(p_user, 'checkin.synced_late', 'checkin', v_id,
                     jsonb_build_object('local_date', p_local_date));
  perform private.after_checkin_saved(p_user, v_before, p_now);
  return 'synced_late';
end;
$$;

create or replace function public.submit_offline_checkin(
  p_local_date date,
  p_recorded_at timestamptz,
  p_outcome text,
  p_mood integer default null,
  p_urge_level integer default null,
  p_triggers text[] default '{}',
  p_note_encrypted text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from private.checkin_caller();
  perform private.throttle(c.caller_id, 'checkin_save', 40, interval '1 hour');
  return private.save_offline_checkin(c.caller_id, c.tz, p_local_date, p_recorded_at, p_outcome, p_mood,
                                      p_urge_level, p_triggers, p_note_encrypted, now());
end;
$$;

revoke all on function private.save_offline_checkin(uuid, text, date, timestamptz, text, integer, integer, text[], text, timestamptz) from public;
revoke all on function public.submit_offline_checkin(date, timestamptz, text, integer, integer, text[], text) from public, anon;
grant execute on function public.submit_offline_checkin(date, timestamptz, text, integer, integer, text[], text) to authenticated;

-- ---------------------------------------------------------------- reading the level

-- The person's own level card: live level, label, era, verse, progress, and
-- what it was just before their last save.
create or replace function private.level_overview(p_user uuid, p_tz text, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'level', lv.level,
    'progress_days', lv.progress,
    'days_to_next', util.level_days_to_next(lv.level),
    'highest_level', lv.highest,
    'missed_since_last', lv.missed,
    'stored_level', coalesce(s.level, 0),
    'level_before_save', s.level_before_save,
    'label', cur.label, 'era', cur.era, 'reference', cur.reference, 'verse_text', cur.verse_text,
    'tier', cur.tier,
    'next_label', nxt.label, 'next_era', nxt.era,
    'before_label', bef.label, 'before_era', bef.era
  )
  from private.live_level(p_user, p_tz, p_now) lv
  cross join lateral util.level_info(lv.level) cur
  cross join lateral util.level_info(lv.level + 1) nxt
  left join public.user_stats s on s.user_id = p_user
  left join lateral util.level_info(s.level_before_save) bef on s.level_before_save is not null;
$$;

create or replace function public.my_level()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from private.checkin_caller();
  return private.level_overview(c.caller_id, c.tz, now());
end;
$$;

revoke all on function private.level_overview(uuid, text, timestamptz) from public;
revoke all on function public.my_level() from public, anon;
grant execute on function public.my_level() to authenticated;

-- ---------------------------------------------------------------- what groups see

-- The live level joins the group view at streak or full only: a 10-level drop
-- would otherwise reveal a slip at checkin_only (§7.6).
create or replace view public.group_checkins_today
with (security_barrier = true)
as
select
  m.group_id,
  m.user_id,
  (c.id is not null) as checked_in_today,
  case when v.rank >= 1 then util.live_count(s.current_streak, s.last_checkin_date, p.timezone) end as current_streak,
  case when v.rank >= 2 then c.outcome end as outcome,
  case when v.rank >= 3 then c.mood end as mood,
  case when v.rank >= 3 then c.urge_level end as urge_level,
  case when v.rank >= 3 then c.triggers end as triggers,
  case when v.rank >= 1 then util.member_level(m.user_id) end as level
from public.group_members m
join public.profiles p
  on p.id = m.user_id and p.deleted_at is null and p.deletion_requested_at is null
left join public.checkins c
  on c.user_id = m.user_id and c.local_date = util.local_today(p.timezone)
left join public.user_stats s
  on s.user_id = m.user_id
cross join lateral (
  select case
    when m.user_id = auth.uid() or util.are_partners(auth.uid(), m.user_id) then 3
    else util.share_rank(m.share_level)
  end as rank
) v
where m.status = 'active'
  and util.session_ok()
  and m.group_id in (
    select me.group_id from public.group_members me
     where me.user_id = auth.uid() and me.status = 'active'
  );

-- Profile cards show the level only to someone who can already see it in a
-- group they share: the owner shares streak or full there (or it's yourself).
create or replace function util.can_see_level(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer is not null and (viewer = owner or exists (
    select 1
      from public.group_members v
      join public.group_members o on o.group_id = v.group_id
     where v.user_id = viewer and v.status = 'active'
       and o.user_id = owner and o.status = 'active'
       and util.share_rank(o.share_level) >= 1
  ));
$$;

revoke all on function util.can_see_level(uuid, uuid) from public, anon;
grant execute on function util.can_see_level(uuid, uuid) to authenticated, service_role;

create or replace view public.profile_cards
with (security_barrier = true)
as
select
  p.id,
  p.handle,
  p.display_name,
  p.avatar_path,
  case when util.can_see(auth.uid(), p.id, s.bio_visibility) then p.bio end as bio,
  case when util.can_see(auth.uid(), p.id, s.testimony_visibility) then p.testimony end as testimony,
  case when util.can_see(auth.uid(), p.id, s.verse_visibility) then p.favourite_verse end as favourite_verse,
  p.created_at as joined_at,
  case when util.can_see_level(auth.uid(), p.id) then util.member_level(p.id) end as level
from public.profiles p
join public.privacy_settings s on s.user_id = p.id
where p.deleted_at is null
  and p.deletion_requested_at is null
  and util.can_see(auth.uid(), p.id, s.profile_visibility);

revoke all on table public.profile_cards from anon, authenticated;
grant select on table public.profile_cards to authenticated;

-- ---------------------------------------------------------------- existing people

select private.recompute_level(id, now()) from public.profiles where deleted_at is null;
