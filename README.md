# Book List Flask Application

This is a simple Flask web application that displays a list of books from a SQLite database.

## Features

- Displays a list of books with their title, author, genre, and publication year
- Responsive web design using Bootstrap
- Clean and modern interface

## Installation

1. Clone this repository
2. Create a virtual environment:
   ```
   python -m venv venv
   ```
3. Activate the virtual environment:
   - On Windows: `venv\Scripts\activate`
   - On macOS/Linux: `source venv/bin/activate`
4. Install the required dependencies:
   ```
   pip install -r requirements.txt
   ```

## Running the Application

1. Make sure you're in the virtual environment
2. Run the application:
   ```
   python app.py
   ```
3. Open your web browser and go to `http://127.0.0.1:5000`

## Project Structure

```
.
├── app.py                 # Main Flask application
├── create_db.py           # Script to create and populate the database
├── requirements.txt       # Python dependencies
├── books.db               # SQLite database with book data
├── templates/
│   └── index.html         # Main HTML template
└── README.md              # This file
```

## Database

The application uses SQLite to store book information. The database file `books.db` is created automatically by the `create_db.py` script and contains sample data for 10 books.

## License

This project is open source and available under the MIT License.