import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, Colors } from '../lib/theme';

// ─── Data ────────────────────────────────────────────────────────────────────

type Gender = 'boy' | 'girl' | 'neutral';

type BabyName = {
  name: string;
  gender: Gender;
  origin: string;
  meaning: string;
  tags: string[];
};

const NAMES: BabyName[] = [
  // Boys
  { name: 'Ace', gender: 'boy', origin: 'Latin', meaning: 'One, unity', tags: ['Short', 'Cool', 'Modern'] },
  { name: 'Aiden', gender: 'boy', origin: 'Irish', meaning: 'Little fire', tags: ['Celtic', 'Popular', 'Modern'] },
  { name: 'Alexander', gender: 'boy', origin: 'Greek', meaning: 'Defender of the people', tags: ['Classic', 'Greek', 'Royal'] },
  { name: 'Archer', gender: 'boy', origin: 'English', meaning: 'Bowman', tags: ['Surname', 'Strong', 'Modern'] },
  { name: 'Arthur', gender: 'boy', origin: 'Celtic', meaning: 'Bear king', tags: ['Classic', 'Celtic', 'Vintage'] },
  { name: 'Asher', gender: 'boy', origin: 'Hebrew', meaning: 'Happy, blessed', tags: ['Hebrew', 'Biblical', 'Modern'] },
  { name: 'Atlas', gender: 'boy', origin: 'Greek', meaning: 'To carry, endure', tags: ['Greek', 'Mythological', 'Strong'] },
  { name: 'Atticus', gender: 'boy', origin: 'Latin', meaning: 'From Athens', tags: ['Latin', 'Literary', 'Vintage'] },
  { name: 'August', gender: 'boy', origin: 'Latin', meaning: 'Great, venerable', tags: ['Latin', 'Classic', 'Vintage'] },
  { name: 'Beckett', gender: 'boy', origin: 'English', meaning: 'Little brook', tags: ['Surname', 'Modern', 'Charming'] },
  { name: 'Benjamin', gender: 'boy', origin: 'Hebrew', meaning: 'Son of the right hand', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Caleb', gender: 'boy', origin: 'Hebrew', meaning: 'Faithful, devoted', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Callum', gender: 'boy', origin: 'Celtic', meaning: 'Dove', tags: ['Celtic', 'Scottish', 'Nature'] },
  { name: 'Carter', gender: 'boy', origin: 'English', meaning: 'Cart driver', tags: ['Surname', 'Modern', 'Popular'] },
  { name: 'Declan', gender: 'boy', origin: 'Irish', meaning: 'Full of goodness', tags: ['Celtic', 'Irish', 'Strong'] },
  { name: 'Eli', gender: 'boy', origin: 'Hebrew', meaning: 'Ascended, uplifted', tags: ['Hebrew', 'Biblical', 'Short'] },
  { name: 'Elijah', gender: 'boy', origin: 'Hebrew', meaning: 'My God is Yahweh', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Emmett', gender: 'boy', origin: 'English', meaning: 'Entire, universal', tags: ['Vintage', 'Charming', 'Classic'] },
  { name: 'Ethan', gender: 'boy', origin: 'Hebrew', meaning: 'Strong, firm', tags: ['Hebrew', 'Classic', 'Popular'] },
  { name: 'Ezekiel', gender: 'boy', origin: 'Hebrew', meaning: 'God strengthens', tags: ['Hebrew', 'Biblical', 'Strong'] },
  { name: 'Ezra', gender: 'boy', origin: 'Hebrew', meaning: 'Help, helper', tags: ['Hebrew', 'Biblical', 'Modern'] },
  { name: 'Felix', gender: 'boy', origin: 'Latin', meaning: 'Happy, fortunate', tags: ['Latin', 'Classic', 'Cheerful'] },
  { name: 'Finn', gender: 'boy', origin: 'Irish', meaning: 'Fair', tags: ['Celtic', 'Irish', 'Short'] },
  { name: 'Grayson', gender: 'boy', origin: 'English', meaning: 'Son of the grey-haired one', tags: ['Surname', 'Modern', 'Popular'] },
  { name: 'Henry', gender: 'boy', origin: 'German', meaning: 'Ruler of the home', tags: ['Classic', 'Royal', 'Vintage'] },
  { name: 'Hudson', gender: 'boy', origin: 'English', meaning: 'Son of Hugh', tags: ['Surname', 'Modern', 'Popular'] },
  { name: 'Hugo', gender: 'boy', origin: 'Latin', meaning: 'Mind, spirit', tags: ['Latin', 'Vintage', 'Literary'] },
  { name: 'Isaiah', gender: 'boy', origin: 'Hebrew', meaning: 'God is salvation', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Jack', gender: 'boy', origin: 'English', meaning: 'God is gracious', tags: ['Classic', 'Short', 'Popular'] },
  { name: 'Jackson', gender: 'boy', origin: 'English', meaning: 'Son of Jack', tags: ['Surname', 'Modern', 'Popular'] },
  { name: 'James', gender: 'boy', origin: 'Hebrew', meaning: 'Supplanter', tags: ['Hebrew', 'Classic', 'Royal'] },
  { name: 'Jasper', gender: 'boy', origin: 'Persian', meaning: 'Treasurer', tags: ['Vintage', 'Nature', 'Gem'] },
  { name: 'Josiah', gender: 'boy', origin: 'Hebrew', meaning: 'God supports, heals', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Julian', gender: 'boy', origin: 'Latin', meaning: 'Youthful', tags: ['Latin', 'Classic', 'Elegant'] },
  { name: 'Knox', gender: 'boy', origin: 'Scottish', meaning: 'Round hill', tags: ['Scottish', 'Strong', 'Short'] },
  { name: 'Leo', gender: 'boy', origin: 'Latin', meaning: 'Lion', tags: ['Latin', 'Short', 'Strong'] },
  { name: 'Levi', gender: 'boy', origin: 'Hebrew', meaning: 'Joined, attached', tags: ['Hebrew', 'Biblical', 'Modern'] },
  { name: 'Liam', gender: 'boy', origin: 'Irish', meaning: 'Strong-willed warrior', tags: ['Celtic', 'Irish', 'Popular'] },
  { name: 'Lincoln', gender: 'boy', origin: 'English', meaning: 'Lake colony', tags: ['Surname', 'Modern', 'Strong'] },
  { name: 'Logan', gender: 'boy', origin: 'Scottish', meaning: 'Little hollow', tags: ['Scottish', 'Celtic', 'Modern'] },
  { name: 'Luca', gender: 'boy', origin: 'Italian', meaning: 'Bringer of light', tags: ['Italian', 'Modern', 'Bright'] },
  { name: 'Lucas', gender: 'boy', origin: 'Latin', meaning: 'Light', tags: ['Latin', 'Classic', 'Popular'] },
  { name: 'Mason', gender: 'boy', origin: 'English', meaning: 'Stone worker', tags: ['Surname', 'Modern', 'Popular'] },
  { name: 'Mateo', gender: 'boy', origin: 'Spanish', meaning: 'Gift of God', tags: ['Spanish', 'Modern', 'Popular'] },
  { name: 'Micah', gender: 'boy', origin: 'Hebrew', meaning: 'Who is like God', tags: ['Hebrew', 'Biblical', 'Modern'] },
  { name: 'Miles', gender: 'boy', origin: 'Latin', meaning: 'Soldier, merciful', tags: ['Latin', 'Classic', 'Cool'] },
  { name: 'Milo', gender: 'boy', origin: 'Latin', meaning: 'Gracious', tags: ['Latin', 'Vintage', 'Charming'] },
  { name: 'Noah', gender: 'boy', origin: 'Hebrew', meaning: 'Rest, comfort', tags: ['Hebrew', 'Biblical', 'Popular'] },
  { name: 'Nolan', gender: 'boy', origin: 'Irish', meaning: 'Champion', tags: ['Celtic', 'Irish', 'Modern'] },
  { name: 'Oliver', gender: 'boy', origin: 'Latin', meaning: 'Olive tree', tags: ['Latin', 'Classic', 'Popular'] },
  { name: 'Owen', gender: 'boy', origin: 'Welsh', meaning: 'Young warrior', tags: ['Celtic', 'Welsh', 'Classic'] },
  { name: 'Rhys', gender: 'boy', origin: 'Welsh', meaning: 'Ardor', tags: ['Celtic', 'Welsh', 'Short'] },
  { name: 'Roman', gender: 'boy', origin: 'Latin', meaning: 'Citizen of Rome', tags: ['Latin', 'Strong', 'Classic'] },
  { name: 'Sebastian', gender: 'boy', origin: 'Greek', meaning: 'Venerable', tags: ['Greek', 'Classic', 'Elegant'] },
  { name: 'Silas', gender: 'boy', origin: 'Latin', meaning: 'Man of the forest', tags: ['Latin', 'Nature', 'Biblical'] },
  { name: 'Theodore', gender: 'boy', origin: 'Greek', meaning: 'Gift of God', tags: ['Greek', 'Classic', 'Vintage'] },
  { name: 'Thomas', gender: 'boy', origin: 'Hebrew', meaning: 'Twin', tags: ['Hebrew', 'Classic', 'Biblical'] },
  { name: 'Wilder', gender: 'boy', origin: 'English', meaning: 'Untamed', tags: ['Nature', 'Modern', 'Bold'] },
  { name: 'William', gender: 'boy', origin: 'German', meaning: 'Resolute protector', tags: ['Classic', 'Royal', 'Popular'] },
  { name: 'Xavier', gender: 'boy', origin: 'Basque', meaning: 'New house', tags: ['Modern', 'Strong', 'Unique'] },

  // Girls
  { name: 'Abigail', gender: 'girl', origin: 'Hebrew', meaning: 'Father is joyful', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Adelaide', gender: 'girl', origin: 'German', meaning: 'Noble natured', tags: ['Vintage', 'Elegant', 'Royal'] },
  { name: 'Amelia', gender: 'girl', origin: 'German', meaning: 'Work, industrious', tags: ['Classic', 'Popular', 'Elegant'] },
  { name: 'Aria', gender: 'girl', origin: 'Italian', meaning: 'Air, song', tags: ['Italian', 'Modern', 'Musical'] },
  { name: 'Audrey', gender: 'girl', origin: 'English', meaning: 'Noble strength', tags: ['Classic', 'Vintage', 'Elegant'] },
  { name: 'Aurora', gender: 'girl', origin: 'Latin', meaning: 'Dawn', tags: ['Latin', 'Mythological', 'Beautiful'] },
  { name: 'Ava', gender: 'girl', origin: 'Latin', meaning: 'Life', tags: ['Latin', 'Short', 'Popular'] },
  { name: 'Beatrice', gender: 'girl', origin: 'Latin', meaning: 'She who brings happiness', tags: ['Latin', 'Vintage', 'Literary'] },
  { name: 'Cecilia', gender: 'girl', origin: 'Latin', meaning: 'Blind to ones own beauty', tags: ['Latin', 'Classic', 'Musical'] },
  { name: 'Charlotte', gender: 'girl', origin: 'French', meaning: 'Free woman', tags: ['French', 'Classic', 'Royal'] },
  { name: 'Chloe', gender: 'girl', origin: 'Greek', meaning: 'Blooming, fertility', tags: ['Greek', 'Classic', 'Popular'] },
  { name: 'Claire', gender: 'girl', origin: 'French', meaning: 'Bright, clear', tags: ['French', 'Classic', 'Elegant'] },
  { name: 'Clementine', gender: 'girl', origin: 'French', meaning: 'Merciful', tags: ['French', 'Vintage', 'Charming'] },
  { name: 'Daisy', gender: 'girl', origin: 'English', meaning: "Day's eye", tags: ['Nature', 'Sweet', 'Vintage'] },
  { name: 'Eleanor', gender: 'girl', origin: 'Greek', meaning: 'Bright, shining one', tags: ['Greek', 'Classic', 'Royal'] },
  { name: 'Elizabeth', gender: 'girl', origin: 'Hebrew', meaning: 'Pledged to God', tags: ['Hebrew', 'Classic', 'Royal'] },
  { name: 'Ellie', gender: 'girl', origin: 'Greek', meaning: 'Bright, shining one', tags: ['Greek', 'Modern', 'Sweet'] },
  { name: 'Emilia', gender: 'girl', origin: 'Latin', meaning: 'Rival, eager', tags: ['Latin', 'Classic', 'Elegant'] },
  { name: 'Emma', gender: 'girl', origin: 'German', meaning: 'Whole, universal', tags: ['Classic', 'Short', 'Popular'] },
  { name: 'Evelyn', gender: 'girl', origin: 'English', meaning: 'Wished for child', tags: ['Vintage', 'Classic', 'Popular'] },
  { name: 'Fiona', gender: 'girl', origin: 'Irish', meaning: 'Fair, white', tags: ['Celtic', 'Irish', 'Pretty'] },
  { name: 'Florence', gender: 'girl', origin: 'Latin', meaning: 'Flourishing, prosperous', tags: ['Latin', 'Vintage', 'Classic'] },
  { name: 'Freya', gender: 'girl', origin: 'Norse', meaning: 'Noble woman', tags: ['Norse', 'Mythological', 'Strong'] },
  { name: 'Genevieve', gender: 'girl', origin: 'French', meaning: 'Tribe woman', tags: ['French', 'Vintage', 'Elegant'] },
  { name: 'Grace', gender: 'girl', origin: 'Latin', meaning: "God's grace", tags: ['Latin', 'Classic', 'Beautiful'] },
  { name: 'Harper', gender: 'girl', origin: 'English', meaning: 'Harp player', tags: ['Surname', 'Modern', 'Musical'] },
  { name: 'Hazel', gender: 'girl', origin: 'English', meaning: 'Hazel tree', tags: ['Nature', 'Vintage', 'Sweet'] },
  { name: 'Isabella', gender: 'girl', origin: 'Hebrew', meaning: 'Pledged to God', tags: ['Hebrew', 'Classic', 'Royal'] },
  { name: 'Isla', gender: 'girl', origin: 'Scottish', meaning: 'Island', tags: ['Scottish', 'Celtic', 'Modern'] },
  { name: 'Ivy', gender: 'girl', origin: 'English', meaning: 'Faithfulness', tags: ['Nature', 'Modern', 'Short'] },
  { name: 'Josephine', gender: 'girl', origin: 'Hebrew', meaning: 'God will add', tags: ['Hebrew', 'Classic', 'Royal'] },
  { name: 'Juniper', gender: 'girl', origin: 'Latin', meaning: 'Young, evergreen', tags: ['Latin', 'Nature', 'Modern'] },
  { name: 'Layla', gender: 'girl', origin: 'Arabic', meaning: 'Night, dark beauty', tags: ['Arabic', 'Modern', 'Beautiful'] },
  { name: 'Lily', gender: 'girl', origin: 'English', meaning: 'Purity, beauty', tags: ['Nature', 'Classic', 'Sweet'] },
  { name: 'Lucy', gender: 'girl', origin: 'Latin', meaning: 'Light', tags: ['Latin', 'Classic', 'Short'] },
  { name: 'Luna', gender: 'girl', origin: 'Latin', meaning: 'Moon', tags: ['Latin', 'Mythological', 'Modern'] },
  { name: 'Lydia', gender: 'girl', origin: 'Greek', meaning: 'Woman from Lydia', tags: ['Greek', 'Classic', 'Biblical'] },
  { name: 'Maeve', gender: 'girl', origin: 'Irish', meaning: 'She who intoxicates', tags: ['Celtic', 'Irish', 'Mythological'] },
  { name: 'Maya', gender: 'girl', origin: 'Sanskrit', meaning: 'Illusion, dream', tags: ['Sanskrit', 'Modern', 'Beautiful'] },
  { name: 'Mia', gender: 'girl', origin: 'Italian', meaning: 'Mine, beloved', tags: ['Italian', 'Short', 'Popular'] },
  { name: 'Naomi', gender: 'girl', origin: 'Hebrew', meaning: 'Pleasant', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Nora', gender: 'girl', origin: 'Irish', meaning: 'Honor', tags: ['Celtic', 'Irish', 'Classic'] },
  { name: 'Olivia', gender: 'girl', origin: 'Latin', meaning: 'Olive tree', tags: ['Latin', 'Classic', 'Popular'] },
  { name: 'Penelope', gender: 'girl', origin: 'Greek', meaning: 'Weaver', tags: ['Greek', 'Classic', 'Literary'] },
  { name: 'Piper', gender: 'girl', origin: 'English', meaning: 'Pipe player', tags: ['Modern', 'Musical', 'Fun'] },
  { name: 'Rosalie', gender: 'girl', origin: 'French', meaning: 'Rose garden', tags: ['French', 'Vintage', 'Beautiful'] },
  { name: 'Ruby', gender: 'girl', origin: 'Latin', meaning: 'Precious red gemstone', tags: ['Latin', 'Gem', 'Vintage'] },
  { name: 'Savannah', gender: 'girl', origin: 'Spanish', meaning: 'Flat tropical grassland', tags: ['Spanish', 'Nature', 'Modern'] },
  { name: 'Scarlett', gender: 'girl', origin: 'English', meaning: 'Bright red', tags: ['Modern', 'Bold', 'Popular'] },
  { name: 'Seraphina', gender: 'girl', origin: 'Hebrew', meaning: 'Fiery-winged', tags: ['Hebrew', 'Biblical', 'Elegant'] },
  { name: 'Sofia', gender: 'girl', origin: 'Greek', meaning: 'Wisdom', tags: ['Greek', 'Classic', 'Popular'] },
  { name: 'Stella', gender: 'girl', origin: 'Latin', meaning: 'Star', tags: ['Latin', 'Classic', 'Beautiful'] },
  { name: 'Violet', gender: 'girl', origin: 'Latin', meaning: 'Purple flower', tags: ['Latin', 'Nature', 'Vintage'] },
  { name: 'Vivienne', gender: 'girl', origin: 'French', meaning: 'Alive, lively', tags: ['French', 'Elegant', 'Vintage'] },
  { name: 'Willow', gender: 'girl', origin: 'English', meaning: 'Willow tree', tags: ['Nature', 'Modern', 'Peaceful'] },
  { name: 'Zoey', gender: 'girl', origin: 'Greek', meaning: 'Life', tags: ['Greek', 'Modern', 'Popular'] },

  // Neutral
  { name: 'Avery', gender: 'neutral', origin: 'English', meaning: 'Ruler of elves', tags: ['Modern', 'Popular', 'Surname'] },
  { name: 'Bay', gender: 'neutral', origin: 'English', meaning: 'Sea inlet', tags: ['Nature', 'Short', 'Unique'] },
  { name: 'Blake', gender: 'neutral', origin: 'English', meaning: 'Dark, fair', tags: ['Modern', 'Cool', 'Short'] },
  { name: 'Cameron', gender: 'neutral', origin: 'Scottish', meaning: 'Crooked nose', tags: ['Celtic', 'Scottish', 'Surname'] },
  { name: 'Cedar', gender: 'neutral', origin: 'English', meaning: 'Cedar tree', tags: ['Nature', 'Unique', 'Modern'] },
  { name: 'Ember', gender: 'neutral', origin: 'English', meaning: 'Spark of fire', tags: ['Nature', 'Modern', 'Bold'] },
  { name: 'Emerson', gender: 'neutral', origin: 'English', meaning: 'Son of Emery', tags: ['Surname', 'Modern', 'Classic'] },
  { name: 'Finley', gender: 'neutral', origin: 'Irish', meaning: 'Fair-haired hero', tags: ['Celtic', 'Irish', 'Modern'] },
  { name: 'Gray', gender: 'neutral', origin: 'English', meaning: 'Grey-haired', tags: ['Short', 'Modern', 'Cool'] },
  { name: 'Hayden', gender: 'neutral', origin: 'English', meaning: 'Heather hill', tags: ['Nature', 'Modern', 'Surname'] },
  { name: 'Indigo', gender: 'neutral', origin: 'Greek', meaning: 'Blue-violet color', tags: ['Greek', 'Unique', 'Bold'] },
  { name: 'Jordan', gender: 'neutral', origin: 'Hebrew', meaning: 'To flow down', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Lake', gender: 'neutral', origin: 'English', meaning: 'Body of water', tags: ['Nature', 'Short', 'Unique'] },
  { name: 'Marlowe', gender: 'neutral', origin: 'English', meaning: 'Driftwood', tags: ['Surname', 'Literary', 'Modern'] },
  { name: 'Morgan', gender: 'neutral', origin: 'Welsh', meaning: 'Sea circle', tags: ['Celtic', 'Welsh', 'Classic'] },
  { name: 'Phoenix', gender: 'neutral', origin: 'Greek', meaning: 'Dark red, mythical bird', tags: ['Greek', 'Mythological', 'Bold'] },
  { name: 'Quinn', gender: 'neutral', origin: 'Irish', meaning: 'Descendant of Conn', tags: ['Celtic', 'Irish', 'Short'] },
  { name: 'Reese', gender: 'neutral', origin: 'Welsh', meaning: 'Ardor, enthusiasm', tags: ['Celtic', 'Welsh', 'Modern'] },
  { name: 'Remi', gender: 'neutral', origin: 'French', meaning: 'Oarsman', tags: ['French', 'Modern', 'Short'] },
  { name: 'River', gender: 'neutral', origin: 'English', meaning: 'Flowing water', tags: ['Nature', 'Modern', 'Peaceful'] },
  { name: 'Rowan', gender: 'neutral', origin: 'Irish', meaning: 'Little red-haired one', tags: ['Celtic', 'Nature', 'Modern'] },
  { name: 'Sage', gender: 'neutral', origin: 'Latin', meaning: 'Wise one', tags: ['Latin', 'Nature', 'Modern'] },
  { name: 'Saylor', gender: 'neutral', origin: 'English', meaning: 'One who sails', tags: ['Modern', 'Adventurous', 'Unique'] },
  { name: 'Scout', gender: 'neutral', origin: 'English', meaning: 'To listen', tags: ['Modern', 'Literary', 'Cool'] },
  { name: 'Skylar', gender: 'neutral', origin: 'Dutch', meaning: 'Scholar', tags: ['Modern', 'Cool', 'Unique'] },
  { name: 'Sloane', gender: 'neutral', origin: 'Irish', meaning: 'Warrior', tags: ['Celtic', 'Irish', 'Strong'] },
  { name: 'Sol', gender: 'neutral', origin: 'Latin', meaning: 'Sun', tags: ['Latin', 'Nature', 'Short'] },
  { name: 'Wren', gender: 'neutral', origin: 'English', meaning: 'Small bird', tags: ['Nature', 'Short', 'Sweet'] },

  // Boys (extended)
  { name: 'Aaron', gender: 'boy', origin: 'Hebrew', meaning: 'High mountain', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Adrian', gender: 'boy', origin: 'Latin', meaning: 'From Hadria', tags: ['Latin', 'Classic', 'Strong'] },
  { name: 'Alistair', gender: 'boy', origin: 'Scottish', meaning: 'Defender of men', tags: ['Scottish', 'Celtic', 'Classic'] },
  { name: 'Ambrose', gender: 'boy', origin: 'Latin', meaning: 'Immortal', tags: ['Latin', 'Vintage', 'Classic'] },
  { name: 'Andrew', gender: 'boy', origin: 'Greek', meaning: 'Manly, brave', tags: ['Greek', 'Biblical', 'Classic'] },
  { name: 'Benedict', gender: 'boy', origin: 'Latin', meaning: 'Blessed', tags: ['Latin', 'Classic', 'Vintage'] },
  { name: 'Brennan', gender: 'boy', origin: 'Irish', meaning: 'Descendant of Braonán', tags: ['Celtic', 'Irish', 'Strong'] },
  { name: 'Caspian', gender: 'boy', origin: 'Greek', meaning: 'Of the Caspian', tags: ['Greek', 'Literary', 'Modern'] },
  { name: 'Christian', gender: 'boy', origin: 'Latin', meaning: 'Follower of Christ', tags: ['Latin', 'Biblical', 'Classic'] },
  { name: 'Christopher', gender: 'boy', origin: 'Greek', meaning: 'Bearer of Christ', tags: ['Greek', 'Biblical', 'Classic'] },
  { name: 'Cillian', gender: 'boy', origin: 'Irish', meaning: 'War, strife', tags: ['Celtic', 'Irish', 'Strong'] },
  { name: 'Clement', gender: 'boy', origin: 'Latin', meaning: 'Mild, merciful', tags: ['Latin', 'Vintage', 'Classic'] },
  { name: 'Colt', gender: 'boy', origin: 'English', meaning: 'Young horse', tags: ['English', 'Modern', 'Bold'] },
  { name: 'Connor', gender: 'boy', origin: 'Irish', meaning: 'Lover of hounds', tags: ['Celtic', 'Irish', 'Popular'] },
  { name: 'Cyrus', gender: 'boy', origin: 'Persian', meaning: 'Sun', tags: ['Persian', 'Strong', 'Classic'] },
  { name: 'Damian', gender: 'boy', origin: 'Greek', meaning: 'To tame', tags: ['Greek', 'Classic', 'Strong'] },
  { name: 'Dashiell', gender: 'boy', origin: 'French', meaning: 'Page boy', tags: ['French', 'Surname', 'Literary'] },
  { name: 'Donovan', gender: 'boy', origin: 'Irish', meaning: 'Dark warrior', tags: ['Celtic', 'Irish', 'Strong'] },
  { name: 'Drake', gender: 'boy', origin: 'English', meaning: 'Dragon', tags: ['English', 'Strong', 'Modern'] },
  { name: 'Edmund', gender: 'boy', origin: 'English', meaning: 'Prosperous protector', tags: ['English', 'Classic', 'Vintage'] },
  { name: 'Edward', gender: 'boy', origin: 'English', meaning: 'Wealthy guardian', tags: ['English', 'Classic', 'Royal'] },
  { name: 'Elias', gender: 'boy', origin: 'Hebrew', meaning: 'My God is Yahweh', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Elliott', gender: 'boy', origin: 'English', meaning: 'My God is Yahweh', tags: ['English', 'Classic', 'Modern'] },
  { name: 'Emilio', gender: 'boy', origin: 'Spanish', meaning: 'Rival, eager', tags: ['Spanish', 'Modern', 'Elegant'] },
  { name: 'Evander', gender: 'boy', origin: 'Greek', meaning: 'Good man', tags: ['Greek', 'Mythological', 'Strong'] },
  { name: 'Fletcher', gender: 'boy', origin: 'English', meaning: 'Arrow maker', tags: ['English', 'Surname', 'Modern'] },
  { name: 'Flynn', gender: 'boy', origin: 'Irish', meaning: 'Son of the red-haired one', tags: ['Celtic', 'Irish', 'Short'] },
  { name: 'Frederick', gender: 'boy', origin: 'Germanic', meaning: 'Peaceful ruler', tags: ['Germanic', 'Classic', 'Royal'] },
  { name: 'Gideon', gender: 'boy', origin: 'Hebrew', meaning: 'Great warrior', tags: ['Hebrew', 'Biblical', 'Strong'] },
  { name: 'Grant', gender: 'boy', origin: 'Scottish', meaning: 'Large, great', tags: ['Scottish', 'Short', 'Strong'] },
  { name: 'Griffith', gender: 'boy', origin: 'Welsh', meaning: 'Strong lord', tags: ['Welsh', 'Celtic', 'Strong'] },
  { name: 'Hadrian', gender: 'boy', origin: 'Latin', meaning: 'From Hadria', tags: ['Latin', 'Classic', 'Strong'] },
  { name: 'Hector', gender: 'boy', origin: 'Greek', meaning: 'Steadfast', tags: ['Greek', 'Mythological', 'Strong'] },
  { name: 'Ivan', gender: 'boy', origin: 'Slavic', meaning: 'God is gracious', tags: ['Slavic', 'Classic', 'Strong'] },
  { name: 'Jesse', gender: 'boy', origin: 'Hebrew', meaning: 'Gift', tags: ['Hebrew', 'Biblical', 'Modern'] },
  { name: 'Joel', gender: 'boy', origin: 'Hebrew', meaning: 'God is willing', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Jonathan', gender: 'boy', origin: 'Hebrew', meaning: 'God has given', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Kieran', gender: 'boy', origin: 'Irish', meaning: 'Dark one', tags: ['Celtic', 'Irish', 'Modern'] },
  { name: 'Lawrence', gender: 'boy', origin: 'Latin', meaning: 'From Laurentum', tags: ['Latin', 'Classic', 'Vintage'] },
  { name: 'Lorcan', gender: 'boy', origin: 'Irish', meaning: 'Little fierce one', tags: ['Celtic', 'Irish', 'Unique'] },
  { name: 'Magnus', gender: 'boy', origin: 'Latin', meaning: 'Great', tags: ['Latin', 'Strong', 'Classic'] },
  { name: 'Marcus', gender: 'boy', origin: 'Latin', meaning: 'Of Mars', tags: ['Latin', 'Classic', 'Strong'] },
  { name: 'Marshall', gender: 'boy', origin: 'French', meaning: 'Horse servant', tags: ['French', 'Surname', 'Modern'] },
  { name: 'Maximilian', gender: 'boy', origin: 'Latin', meaning: 'Greatest', tags: ['Latin', 'Classic', 'Elegant'] },
  { name: 'Maxwell', gender: 'boy', origin: 'Scottish', meaning: 'Great stream', tags: ['Scottish', 'Modern', 'Strong'] },
  { name: 'Moses', gender: 'boy', origin: 'Hebrew', meaning: 'Drawn from water', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Nathaniel', gender: 'boy', origin: 'Hebrew', meaning: 'Gift of God', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Nicholas', gender: 'boy', origin: 'Greek', meaning: 'Victory of the people', tags: ['Greek', 'Classic', 'Popular'] },
  { name: 'Otto', gender: 'boy', origin: 'Germanic', meaning: 'Wealth, fortune', tags: ['Germanic', 'Vintage', 'Short'] },
  { name: 'Patrick', gender: 'boy', origin: 'Latin', meaning: 'Nobleman', tags: ['Latin', 'Classic', 'Celtic'] },
  { name: 'Percy', gender: 'boy', origin: 'French', meaning: 'Pierce valley', tags: ['French', 'Vintage', 'Literary'] },
  { name: 'Philip', gender: 'boy', origin: 'Greek', meaning: 'Lover of horses', tags: ['Greek', 'Classic', 'Royal'] },
  { name: 'Rafael', gender: 'boy', origin: 'Spanish', meaning: 'God has healed', tags: ['Spanish', 'Classic', 'Modern'] },
  { name: 'Rupert', gender: 'boy', origin: 'Germanic', meaning: 'Bright fame', tags: ['Germanic', 'Vintage', 'Literary'] },
  { name: 'Samuel', gender: 'boy', origin: 'Hebrew', meaning: 'God has heard', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Solomon', gender: 'boy', origin: 'Hebrew', meaning: 'Peace', tags: ['Hebrew', 'Biblical', 'Classic'] },

  // Girls (extended)
  { name: 'Agnes', gender: 'girl', origin: 'Greek', meaning: 'Pure, holy', tags: ['Greek', 'Classic', 'Vintage'] },
  { name: 'Alexandra', gender: 'girl', origin: 'Greek', meaning: 'Defender of the people', tags: ['Greek', 'Classic', 'Royal'] },
  { name: 'Alice', gender: 'girl', origin: 'Germanic', meaning: 'Noble', tags: ['Germanic', 'Classic', 'Vintage'] },
  { name: 'Anastasia', gender: 'girl', origin: 'Greek', meaning: 'Resurrection', tags: ['Greek', 'Classic', 'Royal'] },
  { name: 'Arabella', gender: 'girl', origin: 'Latin', meaning: 'Yielding to prayer', tags: ['Latin', 'Vintage', 'Elegant'] },
  { name: 'Athena', gender: 'girl', origin: 'Greek', meaning: 'Goddess of wisdom', tags: ['Greek', 'Mythological', 'Strong'] },
  { name: 'Beatrix', gender: 'girl', origin: 'Latin', meaning: 'She who brings happiness', tags: ['Latin', 'Vintage', 'Literary'] },
  { name: 'Bianca', gender: 'girl', origin: 'Italian', meaning: 'White, shining', tags: ['Italian', 'Elegant', 'Classic'] },
  { name: 'Calliope', gender: 'girl', origin: 'Greek', meaning: 'Beautiful voice', tags: ['Greek', 'Mythological', 'Musical'] },
  { name: 'Camille', gender: 'girl', origin: 'French', meaning: 'Young ceremonial attendant', tags: ['French', 'Classic', 'Elegant'] },
  { name: 'Cassandra', gender: 'girl', origin: 'Greek', meaning: 'Shining upon men', tags: ['Greek', 'Mythological', 'Classic'] },
  { name: 'Celeste', gender: 'girl', origin: 'Latin', meaning: 'Heavenly', tags: ['Latin', 'Classic', 'Beautiful'] },
  { name: 'Clara', gender: 'girl', origin: 'Latin', meaning: 'Bright, clear', tags: ['Latin', 'Classic', 'Elegant'] },
  { name: 'Cordelia', gender: 'girl', origin: 'Celtic', meaning: 'Heart, daughter of the sea', tags: ['Celtic', 'Literary', 'Elegant'] },
  { name: 'Cora', gender: 'girl', origin: 'Greek', meaning: 'Maiden', tags: ['Greek', 'Classic', 'Vintage'] },
  { name: 'Dahlia', gender: 'girl', origin: 'Norse', meaning: 'Valley flower', tags: ['Norse', 'Nature', 'Bold'] },
  { name: 'Diana', gender: 'girl', origin: 'Latin', meaning: 'Divine', tags: ['Latin', 'Mythological', 'Classic'] },
  { name: 'Dorothea', gender: 'girl', origin: 'Greek', meaning: 'Gift of God', tags: ['Greek', 'Classic', 'Vintage'] },
  { name: 'Edith', gender: 'girl', origin: 'English', meaning: 'Prosperous in war', tags: ['English', 'Vintage', 'Classic'] },
  { name: 'Elena', gender: 'girl', origin: 'Greek', meaning: 'Bright, shining one', tags: ['Greek', 'Classic', 'Popular'] },
  { name: 'Eloise', gender: 'girl', origin: 'French', meaning: 'Healthy, wide', tags: ['French', 'Vintage', 'Elegant'] },
  { name: 'Evangeline', gender: 'girl', origin: 'Greek', meaning: 'Good news', tags: ['Greek', 'Elegant', 'Classic'] },
  { name: 'Felicity', gender: 'girl', origin: 'Latin', meaning: 'Happy, fortunate', tags: ['Latin', 'Classic', 'Cheerful'] },
  { name: 'Francesca', gender: 'girl', origin: 'Italian', meaning: 'Free woman', tags: ['Italian', 'Elegant', 'Classic'] },
  { name: 'Georgia', gender: 'girl', origin: 'Greek', meaning: 'Farmer', tags: ['Greek', 'Classic', 'Modern'] },
  { name: 'Gwendolyn', gender: 'girl', origin: 'Welsh', meaning: 'White ring', tags: ['Welsh', 'Celtic', 'Vintage'] },
  { name: 'Helena', gender: 'girl', origin: 'Greek', meaning: 'Bright, shining', tags: ['Greek', 'Classic', 'Elegant'] },
  { name: 'Imogen', gender: 'girl', origin: 'Celtic', meaning: 'Maiden', tags: ['Celtic', 'Literary', 'Vintage'] },
  { name: 'Ingrid', gender: 'girl', origin: 'Norse', meaning: 'Beautiful', tags: ['Norse', 'Vintage', 'Strong'] },
  { name: 'Iris', gender: 'girl', origin: 'Greek', meaning: 'Rainbow', tags: ['Greek', 'Mythological', 'Nature'] },
  { name: 'Jane', gender: 'girl', origin: 'Hebrew', meaning: 'God is gracious', tags: ['Hebrew', 'Classic', 'Short'] },
  { name: 'Juliet', gender: 'girl', origin: 'Latin', meaning: 'Youthful', tags: ['Latin', 'Classic', 'Literary'] },
  { name: 'Lena', gender: 'girl', origin: 'Greek', meaning: 'Bright, shining', tags: ['Greek', 'Short', 'Modern'] },
  { name: 'Loretta', gender: 'girl', origin: 'Latin', meaning: 'Laurel', tags: ['Latin', 'Vintage', 'Musical'] },
  { name: 'Magdalene', gender: 'girl', origin: 'Hebrew', meaning: 'From Magdala', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Margot', gender: 'girl', origin: 'French', meaning: 'Pearl', tags: ['French', 'Vintage', 'Elegant'] },
  { name: 'Matilda', gender: 'girl', origin: 'Germanic', meaning: 'Battle-mighty', tags: ['Germanic', 'Vintage', 'Strong'] },
  { name: 'Millicent', gender: 'girl', origin: 'Germanic', meaning: 'Strong in work', tags: ['Germanic', 'Vintage', 'Classic'] },
  { name: 'Miriam', gender: 'girl', origin: 'Hebrew', meaning: 'Sea of bitterness', tags: ['Hebrew', 'Biblical', 'Classic'] },
  { name: 'Moira', gender: 'girl', origin: 'Irish', meaning: 'Fate', tags: ['Celtic', 'Irish', 'Mythological'] },
  { name: 'Nell', gender: 'girl', origin: 'Greek', meaning: 'Bright, shining one', tags: ['Greek', 'Vintage', 'Short'] },
  { name: 'Niamh', gender: 'girl', origin: 'Irish', meaning: 'Bright', tags: ['Celtic', 'Irish', 'Unique'] },
  { name: 'Ophelia', gender: 'girl', origin: 'Greek', meaning: 'Help', tags: ['Greek', 'Literary', 'Elegant'] },
  { name: 'Phoebe', gender: 'girl', origin: 'Greek', meaning: 'Bright, pure', tags: ['Greek', 'Mythological', 'Classic'] },
  { name: 'Poppy', gender: 'girl', origin: 'English', meaning: 'Red flower', tags: ['English', 'Nature', 'Sweet'] },
  { name: 'Portia', gender: 'girl', origin: 'Latin', meaning: 'Gateway', tags: ['Latin', 'Literary', 'Classic'] },
  { name: 'Rosemary', gender: 'girl', origin: 'Latin', meaning: 'Dew of the sea', tags: ['Latin', 'Nature', 'Vintage'] },
  { name: 'Saoirse', gender: 'girl', origin: 'Irish', meaning: 'Freedom', tags: ['Celtic', 'Irish', 'Unique'] },
  { name: 'Serena', gender: 'girl', origin: 'Latin', meaning: 'Tranquil', tags: ['Latin', 'Classic', 'Elegant'] },
  { name: 'Sylvia', gender: 'girl', origin: 'Latin', meaning: 'Forest', tags: ['Latin', 'Nature', 'Classic'] },
  { name: 'Thea', gender: 'girl', origin: 'Greek', meaning: 'Goddess, godly', tags: ['Greek', 'Short', 'Modern'] },
  { name: 'Valentina', gender: 'girl', origin: 'Latin', meaning: 'Strong, healthy', tags: ['Latin', 'Classic', 'Elegant'] },
  { name: 'Verity', gender: 'girl', origin: 'Latin', meaning: 'Truth', tags: ['Latin', 'Vintage', 'Classic'] },
  { name: 'Victoria', gender: 'girl', origin: 'Latin', meaning: 'Victory', tags: ['Latin', 'Classic', 'Royal'] },
  { name: 'Willa', gender: 'girl', origin: 'Germanic', meaning: 'Will, desire', tags: ['Germanic', 'Vintage', 'Short'] },
  { name: 'Xanthe', gender: 'girl', origin: 'Greek', meaning: 'Golden, yellow', tags: ['Greek', 'Unique', 'Bold'] },

  // Neutral (extended)
  { name: 'Addison', gender: 'neutral', origin: 'English', meaning: 'Son of Adam', tags: ['Surname', 'Modern', 'Popular'] },
  { name: 'Arden', gender: 'neutral', origin: 'English', meaning: 'Eagle valley', tags: ['Nature', 'Literary', 'Modern'] },
  { name: 'Ash', gender: 'neutral', origin: 'English', meaning: 'Ash tree', tags: ['Nature', 'Short', 'Modern'] },
  { name: 'Aubrey', gender: 'neutral', origin: 'French', meaning: 'Elf ruler', tags: ['French', 'Modern', 'Popular'] },
  { name: 'Bailey', gender: 'neutral', origin: 'English', meaning: 'Bailiff', tags: ['Surname', 'Modern', 'Popular'] },
  { name: 'Bellamy', gender: 'neutral', origin: 'French', meaning: 'Good friend', tags: ['French', 'Surname', 'Charming'] },
  { name: 'Billie', gender: 'neutral', origin: 'Germanic', meaning: 'Resolute protector', tags: ['Germanic', 'Modern', 'Short'] },
  { name: 'Briar', gender: 'neutral', origin: 'English', meaning: 'Thorny plant', tags: ['Nature', 'Modern', 'Bold'] },
  { name: 'Cassidy', gender: 'neutral', origin: 'Irish', meaning: 'Curly-haired', tags: ['Celtic', 'Irish', 'Surname'] },
  { name: 'Charlie', gender: 'neutral', origin: 'Germanic', meaning: 'Free man', tags: ['Germanic', 'Modern', 'Popular'] },
  { name: 'Cleo', gender: 'neutral', origin: 'Greek', meaning: 'Glory', tags: ['Greek', 'Short', 'Vintage'] },
  { name: 'Dallas', gender: 'neutral', origin: 'Scottish', meaning: 'Meadow dwelling', tags: ['Scottish', 'Surname', 'Modern'] },
  { name: 'Darcy', gender: 'neutral', origin: 'Irish', meaning: 'Dark one', tags: ['Celtic', 'Irish', 'Classic'] },
  { name: 'Drew', gender: 'neutral', origin: 'Greek', meaning: 'Strong, manly', tags: ['Greek', 'Short', 'Modern'] },
  { name: 'Ellis', gender: 'neutral', origin: 'Welsh', meaning: 'Benevolent', tags: ['Welsh', 'Celtic', 'Surname'] },
  { name: 'Evan', gender: 'neutral', origin: 'Welsh', meaning: 'God is gracious', tags: ['Welsh', 'Celtic', 'Classic'] },
  { name: 'Frankie', gender: 'neutral', origin: 'Latin', meaning: 'Free', tags: ['Latin', 'Modern', 'Short'] },
  { name: 'Harley', gender: 'neutral', origin: 'English', meaning: "Hare's meadow", tags: ['English', 'Nature', 'Modern'] },
  { name: 'Haven', gender: 'neutral', origin: 'English', meaning: 'Safe place', tags: ['English', 'Nature', 'Modern'] },
  { name: 'Hunter', gender: 'neutral', origin: 'English', meaning: 'One who hunts', tags: ['English', 'Surname', 'Modern'] },
  { name: 'Jude', gender: 'neutral', origin: 'Hebrew', meaning: 'Praised', tags: ['Hebrew', 'Biblical', 'Short'] },
  { name: 'Jules', gender: 'neutral', origin: 'Latin', meaning: 'Youthful', tags: ['Latin', 'Short', 'Modern'] },
  { name: 'Kai', gender: 'neutral', origin: 'Hawaiian', meaning: 'Sea', tags: ['Hawaiian', 'Short', 'Modern'] },
  { name: 'Keegan', gender: 'neutral', origin: 'Irish', meaning: 'Small flame', tags: ['Celtic', 'Irish', 'Modern'] },
  { name: 'Kennedy', gender: 'neutral', origin: 'Irish', meaning: 'Helmeted chief', tags: ['Celtic', 'Irish', 'Surname'] },
  { name: 'Kit', gender: 'neutral', origin: 'English', meaning: 'Pure', tags: ['English', 'Short', 'Vintage'] },
  { name: 'Lane', gender: 'neutral', origin: 'English', meaning: 'A small roadway', tags: ['English', 'Short', 'Modern'] },
  { name: 'Lennon', gender: 'neutral', origin: 'Irish', meaning: 'Little cape', tags: ['Celtic', 'Irish', 'Modern'] },
  { name: 'Lennox', gender: 'neutral', origin: 'Scottish', meaning: 'Elm grove', tags: ['Scottish', 'Celtic', 'Surname'] },
  { name: 'Lyric', gender: 'neutral', origin: 'Greek', meaning: 'Lyre, musical', tags: ['Greek', 'Musical', 'Modern'] },
  { name: 'Maren', gender: 'neutral', origin: 'Latin', meaning: 'Of the sea', tags: ['Latin', 'Nature', 'Modern'] },
  { name: 'Marley', gender: 'neutral', origin: 'English', meaning: 'Meadow near the lake', tags: ['English', 'Nature', 'Modern'] },
  { name: 'Monroe', gender: 'neutral', origin: 'Scottish', meaning: 'Mouth of the river', tags: ['Scottish', 'Surname', 'Modern'] },
  { name: 'Oakley', gender: 'neutral', origin: 'English', meaning: 'Oak meadow', tags: ['English', 'Nature', 'Surname'] },
  { name: 'Parker', gender: 'neutral', origin: 'English', meaning: 'Park keeper', tags: ['English', 'Surname', 'Modern'] },
  { name: 'Peyton', gender: 'neutral', origin: 'English', meaning: "Fighting man's estate", tags: ['English', 'Surname', 'Modern'] },
  { name: 'Raven', gender: 'neutral', origin: 'English', meaning: 'Black bird', tags: ['English', 'Nature', 'Bold'] },
  { name: 'Reagan', gender: 'neutral', origin: 'Irish', meaning: 'Little king', tags: ['Celtic', 'Irish', 'Surname'] },
  { name: 'Riley', gender: 'neutral', origin: 'Irish', meaning: 'Courageous', tags: ['Celtic', 'Irish', 'Popular'] },
  { name: 'Rory', gender: 'neutral', origin: 'Irish', meaning: 'Red king', tags: ['Celtic', 'Irish', 'Short'] },
  { name: 'Shiloh', gender: 'neutral', origin: 'Hebrew', meaning: 'Tranquil', tags: ['Hebrew', 'Biblical', 'Nature'] },
  { name: 'Sunny', gender: 'neutral', origin: 'English', meaning: 'Sunshine', tags: ['English', 'Modern', 'Sweet'] },
  { name: 'Sutton', gender: 'neutral', origin: 'English', meaning: 'Southern settlement', tags: ['English', 'Surname', 'Modern'] },
  { name: 'Winter', gender: 'neutral', origin: 'English', meaning: 'Cold season', tags: ['English', 'Nature', 'Modern'] },
];

const ALL_TAGS = [
  'Biblical', 'Celtic', 'Classic', 'Cool', 'Elegant', 'French', 'Gem',
  'Greek', 'Hebrew', 'Irish', 'Italian', 'Latin', 'Literary',
  'Modern', 'Mythological', 'Nature', 'Norse', 'Popular',
  'Royal', 'Sanskrit', 'Scottish', 'Short', 'Spanish', 'Strong',
  'Surname', 'Unique', 'Vintage', 'Welsh',
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const GENDER_FILTERS = [
  { key: 'all',     label: 'All',     emoji: '✨' },
  { key: 'boy',     label: 'Boy',     emoji: '👦' },
  { key: 'girl',    label: 'Girl',    emoji: '👧' },
  { key: 'neutral', label: 'Neutral', emoji: '⚡' },
] as const;

type GenderFilter = 'all' | Gender;

// ─── Component ────────────────────────────────────────────────────────────────

export default function BabyNameFinder({ onBack }: { onBack: () => void }) {
  const c = useColors();
  const s = styles(c);

  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<GenderFilter>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showFavs, setShowFavs] = useState(false);

  const filtered = useMemo(() => {
    return NAMES.filter(n => {
      if (gender !== 'all' && n.gender !== gender) return false;
      if (tag && !n.tags.includes(tag)) return false;
      if (letter && n.name[0].toUpperCase() !== letter) return false;
      if (search && !n.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (showFavs && !favorites.has(n.name)) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [gender, tag, letter, search, showFavs, favorites]);

  function toggleFavorite(name: string) {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function genderCardColor(g: Gender): { bg: string; border: string } {
    if (g === 'boy') return { bg: c.boyBg, border: c.boyBorder };
    if (g === 'girl') return { bg: c.girlBg, border: c.girlBorder };
    return { bg: c.cardLavender, border: c.lavender };
  }

  function genderEmoji(g: Gender) {
    if (g === 'boy') return '👦';
    if (g === 'girl') return '👧';
    return '⚡';
  }

  const renderName = ({ item }: { item: BabyName }) => {
    const isFav = favorites.has(item.name);
    const { bg, border } = genderCardColor(item.gender);
    return (
      <View style={[s.nameCard, { backgroundColor: bg, borderColor: border }]}>
        <View style={s.nameRow}>
          <View style={s.nameLeft}>
            <Text style={s.nameText}>{item.name}</Text>
            <View style={s.nameMeta}>
              <Text style={s.genderEmoji}>{genderEmoji(item.gender)}</Text>
              <View style={[s.originBadge, { borderColor: border }]}>
                <Text style={[s.originText, { color: border }]}>{item.origin}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => toggleFavorite(item.name)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[s.heart, isFav && s.heartFilled]}>
              {isFav ? '♥' : '♡'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={s.meaning}>"{item.meaning}"</Text>
        <View style={s.tagRow}>
          {item.tags.map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setTag(tag === t ? null : t)}
              style={[s.tagChip, tag === t && s.tagChipActive]}
            >
              <Text style={[s.tagChipText, tag === t && s.tagChipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={onBack}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>←</Text>
          <Text style={s.backLabel}>Resources</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Baby Name Finder</Text>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search names..."
          placeholderTextColor={c.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={s.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Gender filter */}
      <View style={s.genderRow}>
        {GENDER_FILTERS.map(g => (
          <TouchableOpacity
            key={g.key}
            onPress={() => setGender(g.key)}
            style={[s.genderPill, gender === g.key && s.genderPillActive]}
          >
            <Text style={s.genderPillEmoji}>{g.emoji}</Text>
            <Text style={[s.genderPillLabel, gender === g.key && s.genderPillLabelActive]}>
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => setShowFavs(f => !f)}
          style={[s.genderPill, showFavs && s.favPillActive]}
        >
          <Text style={s.genderPillEmoji}>{showFavs ? '♥' : '♡'}</Text>
          <Text style={[s.genderPillLabel, showFavs && s.genderPillLabelActive]}>
            Saved {favorites.size > 0 ? `(${favorites.size})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tag chips */}
      <View style={s.tagScrollWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tagScrollContent}
        >
          <TouchableOpacity
            onPress={() => setTag(null)}
            style={[s.filterChip, tag === null && s.filterChipActive]}
          >
            <Text style={[s.filterChipText, tag === null && s.filterChipTextActive]}>All Styles</Text>
          </TouchableOpacity>
          {ALL_TAGS.map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setTag(tag === t ? null : t)}
              style={[s.filterChip, tag === t && s.filterChipActive]}
            >
              <Text style={[s.filterChipText, tag === t && s.filterChipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Alphabet filter */}
      <View style={s.alphaScrollWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.alphaScrollContent}
        >
          {ALPHABET.map(l => (
            <TouchableOpacity
              key={l}
              onPress={() => setLetter(letter === l ? null : l)}
              style={[s.letterBtn, letter === l && s.letterBtnActive]}
            >
              <Text style={[s.letterText, letter === l && s.letterTextActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Results count */}
      <View style={s.countRow}>
        <Text style={s.countText}>
          {filtered.length} {filtered.length === 1 ? 'name' : 'names'} found
        </Text>
        {(tag || letter || search || gender !== 'all' || showFavs) && (
          <TouchableOpacity
            onPress={() => {
              setTag(null);
              setLetter(null);
              setSearch('');
              setGender('all');
              setShowFavs(false);
            }}
          >
            <Text style={s.clearFilters}>Clear filters</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Name list */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.name}
        renderItem={renderName}
        style={s.flatList}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🌸</Text>
            <Text style={s.emptyTitle}>No names found</Text>
            <Text style={s.emptyText}>Try adjusting your filters or search.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (c: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, justifyContent: 'flex-start' },

    header: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
    },
    backArrow: { fontSize: 20, color: c.textSecondary, fontWeight: '700' },
    backLabel: { fontSize: 15, color: c.textSecondary, fontWeight: '700' },
    headerTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: c.textPrimary,
    },

    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: c.inputBorder,
      marginHorizontal: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      marginBottom: 12,
    },
    searchIcon: { fontSize: 16 },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: c.textPrimary,
      fontWeight: '500',
      padding: 0,
    },
    clearBtn: { fontSize: 14, color: c.textMuted, fontWeight: '700' },

    genderRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      marginBottom: 10,
      flexWrap: 'wrap',
    },
    genderPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: c.cardBorder,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    genderPillActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    favPillActive: {
      backgroundColor: '#DB2777',
      borderColor: '#DB2777',
    },
    genderPillEmoji: { fontSize: 14 },
    genderPillLabel: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    genderPillLabelActive: { color: '#FFFFFF' },

    tagScrollWrap: { height: 40, marginBottom: 8, flexShrink: 0, flexGrow: 0 },
    tagScrollContent: { paddingHorizontal: 16, gap: 6, paddingVertical: 5, flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center' },
    filterChip: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardBorder,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    filterChipActive: {
      backgroundColor: c.cardLavender,
      borderColor: c.lavender,
    },
    filterChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    filterChipTextActive: { color: c.lavender },

    alphaScrollWrap: { height: 46, marginBottom: 8, flexShrink: 0, flexGrow: 0 },
    flatList: { flex: 1 },
    alphaScrollContent: { paddingHorizontal: 16, gap: 4, paddingVertical: 9, flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center' },
    letterBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardBorder,
    },
    letterBtnActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    letterText: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    letterTextActive: { color: '#FFFFFF' },

    countRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 18,
      marginBottom: 8,
    },
    countText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    clearFilters: { fontSize: 13, fontWeight: '700', color: c.primary },

    list: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },

    nameCard: {
      borderRadius: 16,
      borderWidth: 2,
      padding: 16,
      gap: 8,
    },
    nameRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    nameLeft: { flex: 1, gap: 4 },
    nameText: {
      fontSize: 22,
      fontWeight: '800',
      color: c.textPrimary,
      letterSpacing: 0.3,
    },
    nameMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    genderEmoji: { fontSize: 16 },
    originBadge: {
      borderRadius: 10,
      borderWidth: 1.5,
      paddingHorizontal: 8,
      paddingVertical: 2,
      backgroundColor: 'rgba(255,255,255,0.5)',
    },
    originText: { fontSize: 12, fontWeight: '700' },
    heart: { fontSize: 24, color: c.textMuted },
    heartFilled: { color: '#DB2777' },

    meaning: {
      fontSize: 14,
      fontWeight: '500',
      color: c.textSecondary,
      fontStyle: 'italic',
      lineHeight: 20,
    },

    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tagChip: {
      backgroundColor: 'rgba(255,255,255,0.5)',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.1)',
    },
    tagChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    tagChipText: { fontSize: 11, fontWeight: '600', color: c.textSecondary },
    tagChipTextActive: { color: '#FFFFFF' },

    empty: {
      alignItems: 'center',
      paddingTop: 60,
      gap: 8,
    },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    emptyText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },
  });
