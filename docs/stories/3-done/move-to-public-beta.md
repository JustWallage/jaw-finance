I want to open up my app to other users; I will open the CF zero trust to accept any email. But before I do that, can you do a thourough research into whether my app is ready to do that? Go over all db patterns, queries, api requests, etc, to see wether it is safe to open it up and to verify everything is isolated. It must never be possible to accidently receive data from another user or that the wrong data is queried, the data must always only be shown to the user's email that is currently logged in

Allow all emails in zero trust

Add google auth
