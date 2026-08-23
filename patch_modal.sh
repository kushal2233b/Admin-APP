sed -i '/Wallet Adjust: {selectedUser.username}/a \
            </h3>\
            <div className="flex items-center gap-2 bg-[#1A1538] p-1 rounded-xl">\
              <button\
                onClick={() => setWalletType("main")}\
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${walletType === "main" ? "bg-purple-600 text-white" : "text-purple-300"}`}\
              >\
                Main Wallet\
              </button>\
              <button\
                onClick={() => setWalletType("winning")}\
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${walletType === "winning" ? "bg-amber-500 text-black" : "text-purple-300"}`}\
              >\
                Winning Balance\
              </button>\
            </div>' src/components/users/UserManagement.tsx
