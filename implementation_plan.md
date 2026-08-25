# Cloud Database Setup Plan (MongoDB)

যেহেতু আপনি চান আপনার বন্ধুরা ইন্টারনেট থেকে এন্ট্রি করুক এবং আপনি সব ডেটা দেখতে পারেন, তাই আমরা **MongoDB** (একটি ফ্রি ক্লাউড ডেটাবেস) ব্যবহার করব। 

এর ফলে:
১. আপনার ওয়েবসাইটটি আগের মতোই দেখতে লাগবে। 
২. আপনি আগের মতোই `Search` করে সব ডেটা দেখতে পারবেন।
৩. `Download Excel`-এ ক্লিক করলে ডেটাবেস থেকে সব ডেটা এক্সেল ফাইল হয়ে আপনার পিসিতে ডাউনলোড হবে!

## User Action Required: MongoDB Setup
Netlify-তে ডেটা সেভ করার জন্য আপনার একটি ফ্রি ডেটাবেস কানেকশন লিংক (Connection String) লাগবে। নিচে দেওয়া ধাপে ধাপে এটি তৈরি করুন এবং আমাকে লিংকটি দিন:

1. **[MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)** ওয়েবসাইটে যান এবং একটি ফ্রি অ্যাকাউন্ট খুলুন (Google দিয়ে Sign Up করতে পারেন)।
2. **"Build a Database"**-এ ক্লিক করুন এবং **M0 FREE** প্ল্যানটি সিলেক্ট করে Create করুন।
3. **Username এবং Password** তৈরি করুন (পাসওয়ার্ডটি কপি করে রাখুন)।
4. **Network Access** সেকশনে গিয়ে `Allow Access from Anywhere (0.0.0.0/0)` সিলেক্ট করুন।
5. **"Connect"** বাটনে ক্লিক করুন এবং **"Drivers" (Node.js)** সিলেক্ট করুন।
6. আপনি একটি লিংক পাবেন (Connection String), যা দেখতে এমন হবে: 
   `mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority`

লিংকটি কপি করে `<password>`-এর জায়গায় আপনার তৈরি করা পাসওয়ার্ডটি বসিয়ে আমাকে এখানে দিন! 

আপনি লিংকটি দিলেই আমি আপনার পুরো ওয়েবসাইটটিকে লোকাল এক্সেল থেকে MongoDB-তে শিফট করে দেব! 🚀
