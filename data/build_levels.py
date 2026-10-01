"""Builds the level table: tier names, level labels and streak days for levels 0-1000."""
import csv, json

VARIANTS = ["", "Lite", "Pro", "Max", "Ultra", "Ultra Pro Max"]
MAX_LEVEL = 1002

# (era, name, reference)
TIERS = [
    ("Beginning", "Clay", "Isaiah 64:8"),  # tier 0, level 0 only
    # Genesis
    ("Genesis", "Breath of Life", "Genesis 2:7"),
    ("Genesis", "Ark Builder", "Genesis 6:14"),
    ("Genesis", "Dove Sender", "Genesis 8:8"),
    ("Genesis", "Rainbow Promise", "Genesis 9:13"),
    ("Genesis", "Pilgrim", "Genesis 12:1"),
    ("Genesis", "Star Counter", "Genesis 15:5"),
    ("Genesis", "Well Digger", "Genesis 26:18"),
    ("Genesis", "Ladder Dreamer", "Genesis 28:12"),
    ("Genesis", "Wrestler", "Genesis 32:24"),
    ("Genesis", "Coat of Many Colors", "Genesis 37:3"),
    ("Genesis", "Temptation Dodger", "Genesis 39:12"),
    ("Genesis", "Palace Riser", "Genesis 41:41"),
    # Exodus to Deuteronomy
    ("Exodus & Wilderness", "Reed Basket", "Exodus 2:3"),
    ("Exodus & Wilderness", "Holy Ground", "Exodus 3:5"),
    ("Exodus & Wilderness", "Passover Ready", "Exodus 12:11"),
    ("Exodus & Wilderness", "Red Sea Crosser", "Exodus 14:22"),
    ("Exodus & Wilderness", "Victory Song", "Exodus 15:1"),
    ("Exodus & Wilderness", "Manna Gatherer", "Exodus 16:18"),
    ("Exodus & Wilderness", "Raised Hands", "Exodus 17:12"),
    ("Exodus & Wilderness", "Ten Words", "Exodus 34:28"),
    ("Exodus & Wilderness", "Shining Face", "Exodus 34:29"),
    ("Exodus & Wilderness", "Cloud Follower", "Exodus 40:36"),
    ("Exodus & Wilderness", "Jubilee", "Leviticus 25:10"),
    ("Exodus & Wilderness", "Nazirite", "Numbers 6:2"),
    ("Exodus & Wilderness", "Grape Carrier", "Numbers 13:23"),
    ("Exodus & Wilderness", "Different Spirit", "Numbers 14:24"),
    ("Exodus & Wilderness", "Choose Life", "Deuteronomy 30:19"),
    # Promised Land (Joshua to Ruth)
    ("Promised Land", "Scarlet Cord", "Joshua 2:18"),
    ("Promised Land", "Step of Faith", "Joshua 3:15"),
    ("Promised Land", "Memorial Stone", "Joshua 4:7"),
    ("Promised Land", "Jericho Shouter", "Joshua 6:20"),
    ("Promised Land", "Sun Stopper", "Joshua 10:13"),
    ("Promised Land", "Mountain Claimer", "Joshua 14:12"),
    ("Promised Land", "Mighty Valor", "Judges 6:12"),
    ("Promised Land", "Fleece Tester", "Judges 6:37"),
    ("Promised Land", "Three Hundred", "Judges 7:7"),
    ("Promised Land", "Torchbearer", "Judges 7:20"),
    ("Promised Land", "Gleaner", "Ruth 2:2"),
    # Kingdom (Samuel and Kings)
    ("Kingdom", "Unquenched Lamp", "1 Samuel 3:3"),
    ("Kingdom", "Here I Am", "1 Samuel 3:4"),
    ("Kingdom", "Ebenezer", "1 Samuel 7:12"),
    ("Kingdom", "Five Stones", "1 Samuel 17:40"),
    ("Kingdom", "Giant Slayer", "1 Samuel 17:50"),
    ("Kingdom", "Covenant Friend", "1 Samuel 18:3"),
    ("Kingdom", "Undignified Dancer", "2 Samuel 6:22"),
    ("Kingdom", "Psalmist", "2 Samuel 23:1"),
    ("Kingdom", "Raven Fed", "1 Kings 17:6"),
    ("Kingdom", "Fire Caller", "1 Kings 18:38"),
    ("Kingdom", "Still Small Voice", "1 Kings 19:12"),
    ("Kingdom", "Double Portion", "2 Kings 2:9"),
    ("Kingdom", "Chariot of Fire", "2 Kings 2:11"),
    ("Kingdom", "Mantle Bearer", "2 Kings 2:13"),
    ("Kingdom", "Overflowing Jar", "2 Kings 4:6"),
    ("Kingdom", "Jordan Dipper", "2 Kings 5:14"),
    ("Kingdom", "Iron Floater", "2 Kings 6:6"),
    # Return and Rebuild
    ("Return & Rebuild", "Face Seeker", "2 Chronicles 7:14"),
    ("Return & Rebuild", "Exile Returner", "Ezra 1:3"),
    ("Return & Rebuild", "Foundation Layer", "Ezra 3:11"),
    ("Return & Rebuild", "Wall Builder", "Nehemiah 4:6"),
    ("Return & Rebuild", "Sword & Trowel", "Nehemiah 4:17"),
    ("Return & Rebuild", "Joy Strong", "Nehemiah 8:10"),
    ("Return & Rebuild", "Such a Time", "Esther 4:14"),
    # Wisdom
    ("Wisdom", "Refined Gold", "Job 23:10"),
    ("Wisdom", "Pure Gaze", "Job 31:1"),
    ("Wisdom", "Streamside Tree", "Psalm 1:3"),
    ("Wisdom", "Thirsty Deer", "Psalm 42:1"),
    ("Wisdom", "Clean Heart", "Psalm 51:10"),
    ("Wisdom", "Shelter Dweller", "Psalm 91:1"),
    ("Wisdom", "Cedar of Lebanon", "Psalm 92:12"),
    ("Wisdom", "Word Hider", "Psalm 119:11"),
    ("Wisdom", "Guarded Heart", "Proverbs 4:23"),
    ("Wisdom", "Ant Watcher", "Proverbs 6:6"),
    ("Wisdom", "Iron Sharpener", "Proverbs 27:17"),
    ("Wisdom", "Lionheart", "Proverbs 28:1"),
    ("Wisdom", "Threefold Cord", "Ecclesiastes 4:12"),
    ("Wisdom", "Fox Catcher", "Song of Songs 2:15"),
    ("Wisdom", "Many Waters", "Song of Songs 8:7"),
    # Prophets
    ("Prophets", "Plowshare", "Isaiah 2:4"),
    ("Prophets", "Live Coal", "Isaiah 6:6"),
    ("Prophets", "Highway Maker", "Isaiah 40:3"),
    ("Prophets", "Eagle Soarer", "Isaiah 40:31"),
    ("Prophets", "Beauty for Ashes", "Isaiah 61:3"),
    ("Prophets", "Oak of Righteousness", "Isaiah 61:3"),
    ("Prophets", "Watchman", "Isaiah 62:6"),
    ("Prophets", "Fire in My Bones", "Jeremiah 20:9"),
    ("Prophets", "New Mercies", "Lamentations 3:23"),
    ("Prophets", "Heart of Flesh", "Ezekiel 36:26"),
    ("Prophets", "Dry Bones Rising", "Ezekiel 37:10"),
    ("Prophets", "Resolved", "Daniel 1:8"),
    ("Prophets", "Fireproof", "Daniel 3:27"),
    ("Prophets", "Lion's Den", "Daniel 6:22"),
    ("Prophets", "Door of Hope", "Hosea 2:15"),
    ("Prophets", "Restored Years", "Joel 2:25"),
    ("Prophets", "Second Chance", "Jonah 3:1"),
    ("Prophets", "Humble Walker", "Micah 6:8"),
    ("Prophets", "Hind's Feet", "Habakkuk 3:19"),
    ("Prophets", "Brand from the Fire", "Zechariah 3:2"),
    ("Prophets", "Not by Might", "Zechariah 4:6"),
    ("Prophets", "Prisoner of Hope", "Zechariah 9:12"),
    ("Prophets", "Leaping Calf", "Malachi 4:2"),
    # Gospels
    ("Gospels", "Voice in the Wilderness", "Matthew 3:3"),
    ("Gospels", "Locust Eater", "Matthew 3:4"),
    ("Gospels", "Net Caster", "Matthew 4:19"),
    ("Gospels", "Pure in Heart", "Matthew 5:8"),
    ("Gospels", "Salt of the Earth", "Matthew 5:13"),
    ("Gospels", "City on a Hill", "Matthew 5:14"),
    ("Gospels", "Extra Miler", "Matthew 5:41"),
    ("Gospels", "Narrow Gate", "Matthew 7:13"),
    ("Gospels", "Rock Solid", "Matthew 7:24"),
    ("Gospels", "Yoke Bearer", "Matthew 11:29"),
    ("Gospels", "Good Soil", "Matthew 13:23"),
    ("Gospels", "Pearl Merchant", "Matthew 13:45"),
    ("Gospels", "Water Walker", "Matthew 14:29"),
    ("Gospels", "Mountain Mover", "Matthew 17:20"),
    ("Gospels", "Seventy Times Seven", "Matthew 18:22"),
    ("Gospels", "Oil Keeper", "Matthew 25:4"),
    ("Gospels", "Talent Multiplier", "Matthew 25:20"),
    ("Gospels", "Roof Breaker", "Mark 2:4"),
    ("Gospels", "Alabaster Jar", "Mark 14:3"),
    ("Gospels", "Homecomer", "Luke 15:20"),
    ("Gospels", "Sycamore Climber", "Luke 19:4"),
    ("Gospels", "Road to Emmaus", "Luke 24:32"),
    ("Gospels", "Wellspring", "John 4:14"),
    ("Gospels", "Unbound", "John 11:44"),
    ("Gospels", "Foot Washer", "John 13:14"),
    ("Gospels", "Vine Abider", "John 15:4"),
    # Acts
    ("Acts", "Upper Room", "Acts 1:13"),
    ("Acts", "Pentecost Flame", "Acts 2:3"),
    ("Acts", "Beautiful Gate", "Acts 3:8"),
    ("Acts", "Encourager", "Acts 4:36"),
    ("Acts", "Scales Fallen", "Acts 9:18"),
    ("Acts", "Chainbreaker", "Acts 12:7"),
    ("Acts", "Midnight Singer", "Acts 16:25"),
    ("Acts", "World Turner", "Acts 17:6"),
    ("Acts", "Berean", "Acts 17:11"),
    ("Acts", "Shipwreck Survivor", "Acts 27:44"),
    ("Acts", "Viper Shaker", "Acts 28:5"),
    # Letters
    ("Letters", "More Than Conqueror", "Romans 8:37"),
    ("Letters", "Living Sacrifice", "Romans 12:1"),
    ("Letters", "Renewed Mind", "Romans 12:2"),
    ("Letters", "Temple Keeper", "1 Corinthians 6:19"),
    ("Letters", "Race Runner", "1 Corinthians 9:24"),
    ("Letters", "Escape Artist", "1 Corinthians 10:13"),
    ("Letters", "New Creation", "2 Corinthians 5:17"),
    ("Letters", "Spirit Walker", "Galatians 5:16"),
    ("Letters", "Fruitful", "Galatians 5:22"),
    ("Letters", "Belt of Truth", "Ephesians 6:14"),
    ("Letters", "Breastplate", "Ephesians 6:14"),
    ("Letters", "Gospel Boots", "Ephesians 6:15"),
    ("Letters", "Shield of Faith", "Ephesians 6:16"),
    ("Letters", "Helmet of Salvation", "Ephesians 6:17"),
    ("Letters", "Sword of the Spirit", "Ephesians 6:17"),
    ("Letters", "Unashamed", "2 Timothy 2:15"),
    ("Letters", "Vessel of Honor", "2 Timothy 2:21"),
    ("Letters", "Royal Priest", "1 Peter 2:9"),
    # Glory (Revelation) and the finale
    ("Glory", "Overcomer", "Revelation 2:7"),
    ("Glory", "Tree of Life", "Revelation 2:7"),
    ("Glory", "Crown of Life", "Revelation 2:10"),
    ("Glory", "Hidden Manna", "Revelation 2:17"),
    ("Glory", "White Stone", "Revelation 2:17"),
    ("Glory", "White Robe", "Revelation 3:5"),
    ("Glory", "Temple Pillar", "Revelation 3:12"),
    ("Glory", "Crystal Sea", "Revelation 15:2"),
    ("Glory", "Golden Harp", "Revelation 15:2"),
    ("Glory", "Pearl Gate", "Revelation 21:21"),
    ("Glory", "Golden Street", "Revelation 21:21"),
    ("Glory", "Well Done", "Matthew 25:21"),
]


def days_for_level(level: int) -> int:
    """Streak days needed to reach a level: every 5 days to level 20, then every 10 days."""
    if level <= 20:
        return 5 * level
    return 100 + 10 * (level - 20)


def tier_and_variant(level: int):
    if level == 0:
        return 0, ""
    return (level - 1) // 6 + 1, VARIANTS[(level - 1) % 6]


RELAPSE_LEVEL_PENALTY = 10


def days_to_next(level: int) -> int:
    """Clean days needed to go from `level` to `level + 1`."""
    return 5 if level + 1 <= 20 else 10


def replay(days):
    """Reference level engine. `days` is a date-ordered list of 'clean', 'slipped' or None (no check-in).
    Returns (level, level_progress_days, highest_level)."""
    level = progress = highest = 0
    for outcome in days:
        if outcome == "clean":
            progress += 1
            if progress >= days_to_next(level):
                level, progress = level + 1, 0
                highest = max(highest, level)
        elif outcome == "slipped":
            level, progress = max(0, level - RELAPSE_LEVEL_PENALTY), 0
        else:  # missed day: streak ends, progress empties, no level loss
            progress = 0
    return level, progress, highest


def self_test():
    assert replay(["clean"] * 100)[0] == 20
    assert replay(["clean"] * 110)[0] == 21
    assert replay(["clean"] * 9900)[0] == 1000
    assert all(replay(["clean"] * days_for_level(l))[0] == l for l in range(0, MAX_LEVEL + 1))
    lvl25 = ["clean"] * days_for_level(25)
    assert replay(lvl25 + ["slipped"]) == (15, 0, 25)
    assert replay(["clean"] * days_for_level(7) + ["slipped"])[0] == 0
    assert replay(["slipped"]) == (0, 0, 0)
    assert replay(["clean"] * 3 + [None] + ["clean"] * 2) == (0, 2, 0)
    print("self-test passed")


def main():
    names = [t[1] for t in TIERS]
    assert len(TIERS) == 168, len(TIERS)
    dupes = {n for n in names if names.count(n) > 1}
    assert not dupes, dupes
    assert tier_and_variant(MAX_LEVEL) == (len(TIERS) - 1, "Ultra Pro Max")

    levels = []
    for lvl in range(MAX_LEVEL + 1):
        tier, variant = tier_and_variant(lvl)
        era, name, ref = TIERS[tier]
        label = f"{name} {variant}".strip()
        levels.append({"level": lvl, "label": label, "tier": tier, "tier_name": name,
                       "variant": variant, "era": era, "reference": ref,
                       "days_from_level_0": days_for_level(lvl)})

    with open("levels.json", "w", encoding="utf-8") as f:
        json.dump({"variants": VARIANTS, "rule": {"every_5_days_until_level": 20, "then_every_days": 10},
                   "tiers": [{"tier": i, "era": e, "name": n, "reference": r} for i, (e, n, r) in enumerate(TIERS)],
                   "levels": levels}, f, ensure_ascii=False, indent=1)
    with open("levels.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(levels[0].keys()))
        w.writeheader()
        w.writerows(levels)

    # Tier summary for the doc
    rows = []
    for i, (era, name, ref) in enumerate(TIERS):
        tl = [l for l in levels if l["tier"] == i]
        first, last = tl[0], tl[-1]
        rows.append((era, i, name, f"{first['level']}" if first == last else f"{first['level']}–{last['level']}",
                     first["days_from_level_0"], ref))
    with open("tiers.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)

    for spot in [0, 1, 2, 6, 7, 12, 13, 20, 21, 24, 25, 100, 500, 1000]:
        l = levels[spot]
        print(spot, l["label"], l["days_from_level_0"], "days", f"({l['days_from_level_0']/365.25:.1f} yrs)")


if __name__ == "__main__":
    main()
    self_test()
