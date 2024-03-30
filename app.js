// Import necessary libraries
// const { cosineSimilarity } = require('ml-distance');
const express = require("express");
const { parse } = require("csv-parse");
const fs = require("fs");

async function readCSV(filePath) {
  const results = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath, { encoding: "utf-8" })
      .pipe(parse({ delimiter: ";", quote: '"', columns: true, escape: "\\" }))
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
}

let booksData, userData, ratingData;

Promise.all([
  readCSV("books.csv"),
  readCSV("users.csv"),
  readCSV("ratings.csv"),
])
  .then(([books, users, ratings]) => {
    booksData = books;
    userData = users;
    ratingData = ratings;
    startServer();
  })
  .catch((error) => console.error(error));

// Function to calculate cosine similarity between two vectors
function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) {
    throw new Error("Vectors must have the same length");
  }
  const dotProduct = vec1.reduce((acc, val, i) => acc + val * vec2[i], 0);
  const magnitude1 = Math.sqrt(vec1.reduce((acc, val) => acc + val * val, 0));
  const magnitude2 = Math.sqrt(vec2.reduce((acc, val) => acc + val * val, 0));
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }
  return dotProduct / (magnitude1 * magnitude2);
}

// Collaborative Filtering: Get top N similar users to the target user
function getSimilarUsers(targetUserId, numSimilarUsers = 2) {
  const targetUserRatings = ratingData.filter(
    (rating) => rating["User-ID"] === targetUserId
  );
  const similarUsers = new Map();
  ratingData.forEach((rating) => {
    if (rating["User-ID"] !== targetUserId) {
      const similarity = cosineSimilarity(
        Object.values(targetUserRatings).map((rating) =>
          parseFloat(rating["Book-Rating"])
        ),
        Object.values(rating)
          .slice(2)
          .map((rating) => parseFloat(rating)) // Ratings of the current user
      );

      if (!similarUsers.has(rating["User-ID"])) {
        similarUsers.set(rating["User-ID"], []);
      }

      similarUsers.get(rating["User-ID"]).push(similarity);
    }
  });

  // Calculate average similarity for each user
  const averageSimilarities = [];
  similarUsers.forEach((similarities, userId) => {
    const averageSimilarity =
      similarities.reduce((acc, val) => acc + val, 0) / similarities.length;
    averageSimilarities.push({ userId, similarity: averageSimilarity });
  });

  // Sort users by similarity in descending order
  averageSimilarities.sort((a, b) => b.similarity - a.similarity);

  return averageSimilarities.slice(0, numSimilarUsers);
}

// Content-Based Filtering: Get top N similar books to the user's liked books// Content-Based Filtering: Get top N similar books to the user's liked books
function getSimilarBooks(userLikedBooks, numSimilarBooks = 10) {
  const likedBookAuthors = new Set();
  userLikedBooks.forEach((bookISBN) => {
    const book = booksData.find((book) => book.ISBN === bookISBN);
    if (book) {
      likedBookAuthors.add(book["Book-Author"]);
    }
  });

  const similarBooks = booksData.filter(
    (book) =>
      !likedBookAuthors.has(book["Book-Author"]) &&
      userLikedBooks.indexOf(book.ISBN) === -1
  );
  return similarBooks.slice(0, numSimilarBooks).map((book) => book.ISBN);
}

// Hybrid Approach: Combine recommendations from collaborative and content-based filtering
function hybridRecommendation(userId, numRecommendations = 10) {
  const similarUsers = getSimilarUsers(userId);
  const userLikedBooks = ratingData
    .filter((rating) =>
      similarUsers.some(
        (user) =>
          user.userId === rating["User-ID"] && rating["Book-Rating"] >= 4
      )
    )
    .map((rating) => rating.ISBN);

  const recommendationsFromContentBased = getSimilarBooks(userLikedBooks);
  const combinedRecommendations = Array.from(
    new Set([...recommendationsFromContentBased])
  );

  // Retrieve book objects corresponding to recommended ISBNs
  const recommendedBooks = combinedRecommendations
    .slice(0, numRecommendations)
    .map((isbn) => booksData.find((book) => book.ISBN === isbn));

  return recommendedBooks;
}

//search
// Function to suggest books based on multiple parameters
function suggestBooks(book, numRecommendations = 10) {
  const { ISBN, "Book-Title": bookTitle, "Book-Author": bookAuthor } = book;

  // Extract features
  const features = {
    ISBN,
    title: bookTitle.toLowerCase(),
    author: bookAuthor.toLowerCase(),
  };

  // Find similar books based on features
  const similarBooks = booksData.map((otherBook) => {
    // Calculate similarity based on multiple features
    const similarityScore = calculateSimilarity(features, otherBook);
    const similarityPercentage = similarityScore * 100;
    return { ...otherBook, similarityPercentage };
  });

  // Sort similarBooks by similarityPercentage in descending order
  similarBooks.sort((a, b) => b.similarityPercentage - a.similarityPercentage);

  // Return top numRecommendations similar books
  return similarBooks.slice(0, numRecommendations);
}

// Function to calculate similarity between two books based on multiple features
function calculateSimilarity(book1, book2) {
  const titleSimilarity = calculateJaccardSimilarity(
    book1.title,
    book2["Book-Title"].toLowerCase()
  );
  const authorSimilarity = calculateJaccardSimilarity(
    book1.author,
    book2["Book-Author"].toLowerCase()
  );
  const combinedSimilarity = (titleSimilarity + authorSimilarity) / 2; // Simple average in this case
  return combinedSimilarity;
}

// Function to calculate Jaccard similarity between two strings
function calculateJaccardSimilarity(str1, str2) {
  const set1 = new Set(str1.split(" "));
  const set2 = new Set(str2.split(" "));
  const intersection = new Set(
    [...set1].filter((element) => set2.has(element))
  );
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

// for save books

function suggestBooksFromArray(userBooks, numRecommendations = 20) {
  // Extract features from user's books
  const userBookFeatures = userBooks.map((book) => ({
    ISBN: book.ISBN,
    title: book["Book-Title"].toLowerCase(),
    author: book["Book-Author"].toLowerCase(),
  }));

  // Find similar books based on user's books
  const similarBooks = [];

  booksData.forEach((otherBook) => {
    const similarities = userBookFeatures.map((userBookFeature) => {
      const similarityScore = calculateSimilarity(userBookFeature, otherBook);
      return similarityScore;
    });

    const averageSimilarity =
      similarities.reduce((acc, val) => acc + val, 0) / similarities.length;
    similarBooks.push({ ...otherBook, averageSimilarity });
  });
  similarBooks.sort((a, b) => b.averageSimilarity - a.averageSimilarity);
  return similarBooks.slice(0, numRecommendations);
}

const app = express();

// Express route to handle book recommendations for a user
app.get("/recommend/:userId", (req, res) => {
  const userId = req.params.userId;
  const recommendations = hybridRecommendation(userId);
  res.json(recommendations);
});
app.get("/book/recommend", (req, res) => {
  const recommendations = suggestBooks({
    ISBN: "0195153448",
    "Book-Title": "Classical Mythology",
    "Book-Author": "Mark P. O. Morford",
  });
  res.json(recommendations);
});
app.get("/savedbook/recommend", (req, res) => {
  const recommendations = suggestBooksFromArray([
    {
      ISBN: "0195153448",
      "Book-Title": "Classical Mythology",
      "Book-Author": "Mark P. O. Morford",
    },
    {
      ISBN: "0002005018",
      "Book-Title": "Clara Callan",
      "Book-Author": "Richard Bruce Wright",
    },
    {
      ISBN: "0060973129",
      "Book-Title": "Decision in Normandy",
      "Book-Author": "Carlo D'Este",
    },
  ]);
  res.json(recommendations);
});
// Start the Express server
function startServer() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
