from sentence_transformers import SentenceTransformer

# Load the model
model = SentenceTransformer('all-MiniLM-L6-v2')
# Your list of unique titles
titles = ["Quantum Computing", "The Hitchhiker's Guide to the Galaxy", "Schrödinger's cat"]
# Generate the high-dimensional vectors
embeddings = model.encode(titles)
# 'embeddings' will be a matrix where each row is an article vector (e.g., 40000 x 384)