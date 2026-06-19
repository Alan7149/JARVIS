from tools.shortcut_builder import generate_all
results = generate_all()
for r in results:
    print(r["name"], "->", r["file"], r["size"], "bytes")
print("Done. Generated", len(results), "shortcuts.")
